"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, db, eq, inArray, schema } from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { logAudit } from "~/lib/audit";
import { getCurrentWorkspace } from "~/lib/workspace";
import { parseOrFlash } from "~/lib/zod-flash";

async function requireEditor() {
  const ws = await getCurrentWorkspace();
  if (ws.role === "viewer") throw new Error("forbidden: editor role required");
  return ws;
}

async function assertPageInWorkspace(pageId: string, workspaceId: string) {
  const [row] = await db()
    .select({ id: schema.statusPages.id })
    .from(schema.statusPages)
    .where(
      and(eq(schema.statusPages.id, pageId), eq(schema.statusPages.workspaceId, workspaceId)),
    )
    .limit(1);
  if (!row) throw new Error("status page not found");
}

// ---------- Tree update (the openstatus pattern) ----------
//
// The components page is one big client form. On submit, the entire desired
// state (groups + components) is sent here, and we diff against what's in DB:
//   - Items with a uuid `id` that still exists → UPDATE in place.
//   - Items without an id, or with an id that no longer exists → INSERT.
//   - Existing rows not in the submitted tree → DELETE.
//
// Group ids referenced by components are matched by `clientGroupId` (the
// client's stable handle for both new and existing groups). After groups are
// upserted we map clientGroupId → real db id, then write components.

const componentSchema = z.object({
  // Optional db id; presence (and existence in DB) decides UPDATE vs INSERT.
  id: z.string().optional(),
  type: z.enum(["monitor", "static"]),
  monitorId: z.string().uuid().nullable(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  staticStatus: z.enum(["up", "down", "degraded", "unknown"]).nullable(),
});

const groupSchema = z.object({
  id: z.string().optional(),
  // Client-assigned stable handle so components can reference their group
  // before it's been written to the DB.
  clientGroupId: z.string(),
  name: z.string().min(1).max(200),
  defaultOpen: z.boolean().default(true),
  components: z.array(componentSchema),
});

const treeSchema = z.object({
  ungrouped: z.array(componentSchema),
  groups: z.array(groupSchema),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function updatePageComponentsTree(pageId: string, formData: FormData) {
  const ws = await requireEditor();
  await assertPageInWorkspace(pageId, ws.workspaceId);

  const raw = formData.get("tree");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(typeof raw === "string" ? raw : "");
  } catch {
    throw new Error("invalid tree payload");
  }
  const tree = parseOrFlash(
    treeSchema,
    parsedJson,
    `/dashboard/status-pages/${pageId}/components`,
  );

  await db().transaction(async (tx) => {
    const existingComponents = await tx
      .select({
        id: schema.pageComponents.id,
        monitorId: schema.pageComponents.monitorId,
      })
      .from(schema.pageComponents)
      .where(eq(schema.pageComponents.statusPageId, pageId));
    const existingComponentIds = new Set(existingComponents.map((c) => c.id));

    const existingGroups = await tx
      .select({ id: schema.pageComponentGroups.id })
      .from(schema.pageComponentGroups)
      .where(eq(schema.pageComponentGroups.statusPageId, pageId));
    const existingGroupIds = new Set(existingGroups.map((g) => g.id));

    // ---- 1. Compute kept-id sets up front ----
    // Anything in the submitted tree with a real DB id stays; everything
    // else gets deleted in step 2. Doing this BEFORE upserts avoids the
    // unique-(page,monitor) constraint blowing up when a monitor row is
    // removed and re-added in the same submit (an INSERT against an old
    // row not yet deleted would conflict).
    const allTreeComponents = [
      ...tree.ungrouped,
      ...tree.groups.flatMap((g) => g.components),
    ];
    const keptComponentIds = new Set<string>();
    for (const c of allTreeComponents) {
      if (c.id && UUID_RE.test(c.id) && existingComponentIds.has(c.id)) {
        keptComponentIds.add(c.id);
      }
    }
    const keptGroupIds = new Set<string>();
    for (const g of tree.groups) {
      if (g.id && UUID_RE.test(g.id) && existingGroupIds.has(g.id)) {
        keptGroupIds.add(g.id);
      }
    }

    // ---- 2. Delete first ----
    const componentsToDelete = [...existingComponentIds].filter(
      (id) => !keptComponentIds.has(id),
    );
    if (componentsToDelete.length > 0) {
      await tx
        .delete(schema.pageComponents)
        .where(inArray(schema.pageComponents.id, componentsToDelete));
    }
    const groupsToDelete = [...existingGroupIds].filter((id) => !keptGroupIds.has(id));
    if (groupsToDelete.length > 0) {
      // FK is ON DELETE SET NULL — components inside a deleted group
      // become ungrouped, then we fix their group_id explicitly below.
      await tx
        .delete(schema.pageComponentGroups)
        .where(inArray(schema.pageComponentGroups.id, groupsToDelete));
    }

    // ---- 3. Upsert groups (in submitted order = position 0..N) ----
    const clientGroupIdToDbId = new Map<string, string>();
    for (let i = 0; i < tree.groups.length; i++) {
      const g = tree.groups[i]!;
      const isExisting = g.id && UUID_RE.test(g.id) && keptGroupIds.has(g.id);
      if (isExisting) {
        await tx
          .update(schema.pageComponentGroups)
          .set({
            name: g.name,
            defaultOpen: g.defaultOpen,
            position: i,
            updatedAt: new Date(),
          })
          .where(eq(schema.pageComponentGroups.id, g.id!));
        clientGroupIdToDbId.set(g.clientGroupId, g.id!);
      } else {
        const [created] = await tx
          .insert(schema.pageComponentGroups)
          .values({
            statusPageId: pageId,
            name: g.name,
            defaultOpen: g.defaultOpen,
            position: i,
          })
          .returning({ id: schema.pageComponentGroups.id });
        if (!created) throw new Error("failed to create group");
        clientGroupIdToDbId.set(g.clientGroupId, created.id);
      }
    }

    // ---- 4. Upsert components (ungrouped first, then per-group) ----
    type Entry = {
      component: z.infer<typeof componentSchema>;
      position: number;
      groupPosition: number;
      groupId: string | null;
    };
    const allEntries: Entry[] = [];
    for (let i = 0; i < tree.ungrouped.length; i++) {
      allEntries.push({
        component: tree.ungrouped[i]!,
        position: i,
        groupPosition: 0,
        groupId: null,
      });
    }
    for (const g of tree.groups) {
      const dbGroupId = clientGroupIdToDbId.get(g.clientGroupId);
      if (!dbGroupId) continue;
      for (let i = 0; i < g.components.length; i++) {
        allEntries.push({
          component: g.components[i]!,
          position: i,
          groupPosition: i,
          groupId: dbGroupId,
        });
      }
    }

    for (const entry of allEntries) {
      const c = entry.component;
      if (c.type === "monitor" && !c.monitorId) {
        throw new Error("monitor component requires monitor_id");
      }
      const isExisting = c.id && UUID_RE.test(c.id) && keptComponentIds.has(c.id);
      if (isExisting) {
        await tx
          .update(schema.pageComponents)
          .set({
            name: c.name,
            description: c.description,
            staticStatus: c.type === "static" ? (c.staticStatus ?? "up") : null,
            groupId: entry.groupId,
            position: entry.position,
            groupPosition: entry.groupPosition,
            updatedAt: new Date(),
          })
          .where(eq(schema.pageComponents.id, c.id!));
      } else {
        if (c.type === "monitor" && c.monitorId) {
          const [m] = await tx
            .select({ id: schema.monitors.id })
            .from(schema.monitors)
            .where(
              and(
                eq(schema.monitors.id, c.monitorId),
                eq(schema.monitors.workspaceId, ws.workspaceId),
              ),
            )
            .limit(1);
          if (!m) throw new Error("monitor not in workspace");
        }
        await tx.insert(schema.pageComponents).values({
          statusPageId: pageId,
          workspaceId: ws.workspaceId,
          type: c.type,
          monitorId: c.type === "monitor" ? c.monitorId : null,
          name: c.name,
          description: c.description,
          staticStatus: c.type === "static" ? (c.staticStatus ?? "up") : null,
          groupId: entry.groupId,
          position: entry.position,
          groupPosition: entry.groupPosition,
        });
      }
    }
  });

  await logAudit({
    action: "page_components.updated",
    targetType: "user",
    targetId: pageId,
    metadata: {
      ungrouped: tree.ungrouped.length,
      groups: tree.groups.length,
    },
  });

  revalidatePath(`/dashboard/status-pages/${pageId}/components`);
  redirect(
    withToastRedirect(
      `/dashboard/status-pages/${pageId}/components`,
      "Components saved",
    ),
  );
}
