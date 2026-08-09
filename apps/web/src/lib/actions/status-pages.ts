"use server";

import { hashPassword } from "@openmonitor/auth/password";
import { and, db, eq, inArray, schema } from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAudit } from "~/lib/audit";
import { getCurrentWorkspace } from "~/lib/workspace";
import { parseOrFlash } from "~/lib/zod-flash";

const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and dashes only");

const writeSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema,
  description: z.string().max(2000).optional(),
  customDomain: z
    .string()
    .max(255)
    // Coarse hostname check — strips empty strings, requires at least a dot.
    .regex(
      /^[a-z0-9.-]+\.[a-z]{2,}$/i,
      "Custom domain must be a valid hostname like status.example.com",
    )
    .optional(),
});

const brandingSchema = z.object({
  logoUrl: z.string().url().max(2000).optional(),
  iconUrl: z.string().url().max(2000).optional(),
  primaryColor: z
    .string()
    .max(64)
    // Allow hex (#abc, #aabbcc), rgb(...), and oklch(...). Anything else gets
    // rejected at form submit so we never inject arbitrary tokens into the
    // page <style>.
    .regex(/^(#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|oklch\([^)]+\))$/, "Use #hex, rgb(…), or oklch(…)")
    .optional(),
  customCss: z.string().max(20000).optional(),
});

const linksSchema = z.object({
  // Both URLs are optional and can be `mailto:`, hence not requiring full URL
  // shape via z.string().url() — coarse-validate format instead.
  homepageUrl: z
    .string()
    .max(2000)
    .regex(/^(https?:\/\/|mailto:).+/i, "must start with http(s):// or mailto:")
    .optional(),
  contactUrl: z
    .string()
    .max(2000)
    .regex(/^(https?:\/\/|mailto:).+/i, "must start with http(s):// or mailto:")
    .optional(),
});

const monitorSelectionSchema = z.object({
  monitorIds: z.array(z.string().uuid()).default([]),
});

async function requireEditor() {
  const ws = await getCurrentWorkspace();
  if (ws.role === "viewer") throw new Error("forbidden: editor role required");
  return ws;
}

function readIsPublic(formData: FormData): boolean {
  return formData.get("isPublic") === "true";
}

function pageScope(id: string, workspaceId: string) {
  return and(eq(schema.statusPages.id, id), eq(schema.statusPages.workspaceId, workspaceId));
}

export async function createStatusPage(formData: FormData) {
  const ws = await requireEditor();
  // Empty `customDomain` should be treated as undefined, not "" — Zod regex
  // would reject the empty string otherwise.
  const cd = (formData.get("customDomain") as string | null)?.trim();
  const parsed = parseOrFlash(
    writeSchema,
    {
      ...Object.fromEntries(formData),
      customDomain: cd ? cd : undefined,
    },
    "/dashboard/status-pages/new",
  );
  const isPublic = readIsPublic(formData);

  const [created] = await db()
    .insert(schema.statusPages)
    .values({
      workspaceId: ws.workspaceId,
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description ?? null,
      customDomain: parsed.customDomain ?? null,
      isPublic,
    })
    .returning({ id: schema.statusPages.id });

  await logAudit({
    action: "status_page.created",
    targetType: "user", // not in AuditTarget; reuse
    targetId: created?.id,
    targetLabel: parsed.name,
    metadata: { slug: parsed.slug, isPublic },
  });

  revalidatePath("/dashboard/status-pages");
  redirect(withToastRedirect(`/dashboard/status-pages/${created?.id}`, `Created “${parsed.name}”`));
}

export async function updateStatusPage(id: string, formData: FormData) {
  const ws = await requireEditor();
  const cd = (formData.get("customDomain") as string | null)?.trim();
  const parsed = parseOrFlash(
    writeSchema,
    {
      ...Object.fromEntries(formData),
      customDomain: cd ? cd : undefined,
    },
    `/dashboard/status-pages/${id}`,
  );
  const isPublic = readIsPublic(formData);

  await db()
    .update(schema.statusPages)
    .set({
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description ?? null,
      customDomain: parsed.customDomain ?? null,
      isPublic,
      updatedAt: new Date(),
    })
    .where(pageScope(id, ws.workspaceId));

  await logAudit({
    action: "status_page.updated",
    targetType: "user",
    targetId: id,
    targetLabel: parsed.name,
  });

  revalidatePath(`/dashboard/status-pages/${id}/edit`);
  redirect(withToastRedirect(`/dashboard/status-pages/${id}/edit`, "Status page saved"));
}

export async function deleteStatusPage(id: string): Promise<void> {
  const ws = await requireEditor();
  const [existing] = await db()
    .select({ name: schema.statusPages.name })
    .from(schema.statusPages)
    .where(pageScope(id, ws.workspaceId))
    .limit(1);

  await db().delete(schema.statusPages).where(pageScope(id, ws.workspaceId));

  await logAudit({
    action: "status_page.deleted",
    targetType: "user",
    targetId: id,
    targetLabel: existing?.name ?? null,
  });

  revalidatePath("/dashboard/status-pages");
  redirect(withToastRedirect("/dashboard/status-pages", "Status page deleted", "info"));
}

/**
 * Set or update a status-page password. Empty input clears the password and
 * makes the page accessible without unlocking. Hashed with the same scrypt
 * params we use for users so we don't need a second hashing scheme.
 */
const passwordSchema = z.object({
  password: z.string().max(200),
});

export async function setStatusPagePassword(id: string, formData: FormData) {
  const ws = await requireEditor();
  const parsed = parseOrFlash(
    passwordSchema,
    Object.fromEntries(formData),
    `/dashboard/status-pages/${id}`,
  );

  const trimmed = parsed.password.trim();
  // Empty password = clear protection. We don't accept whitespace-only as a
  // password (would be too easy to lock yourself out).
  const passwordHash = trimmed ? await hashPassword(trimmed) : null;

  await db()
    .update(schema.statusPages)
    .set({ passwordHash, updatedAt: new Date() })
    .where(pageScope(id, ws.workspaceId));

  await logAudit({
    action: trimmed ? "status_page.password_set" : "status_page.password_cleared",
    targetType: "user",
    targetId: id,
  });

  revalidatePath(`/dashboard/status-pages/${id}/edit`);
  redirect(
    withToastRedirect(
      `/dashboard/status-pages/${id}/edit`,
      trimmed ? "Password protection enabled" : "Password protection cleared",
      trimmed ? "success" : "info",
    ),
  );
}

/** Save branding fields (logo, icon, primary color, custom CSS). */
export async function updateStatusPageBranding(id: string, formData: FormData) {
  const ws = await requireEditor();
  const logoUrl = (formData.get("logoUrl") as string | null)?.trim();
  const iconUrl = (formData.get("iconUrl") as string | null)?.trim();
  const primaryColor = (formData.get("primaryColor") as string | null)?.trim();
  const customCss = (formData.get("customCss") as string | null) ?? "";
  const parsed = parseOrFlash(
    brandingSchema,
    {
      logoUrl: logoUrl || undefined,
      iconUrl: iconUrl || undefined,
      primaryColor: primaryColor || undefined,
      customCss: customCss.trim() ? customCss : undefined,
    },
    `/dashboard/status-pages/${id}/edit`,
  );

  await db()
    .update(schema.statusPages)
    .set({
      logoUrl: parsed.logoUrl ?? null,
      iconUrl: parsed.iconUrl ?? null,
      primaryColor: parsed.primaryColor ?? null,
      customCss: parsed.customCss ?? null,
      updatedAt: new Date(),
    })
    .where(pageScope(id, ws.workspaceId));

  await logAudit({
    action: "status_page.branding_updated",
    targetType: "user",
    targetId: id,
  });

  revalidatePath(`/dashboard/status-pages/${id}/edit`);
  redirect(withToastRedirect(`/dashboard/status-pages/${id}/edit`, "Branding saved"));
}

/** Save the optional homepage + contact links. Both can be empty to hide. */
export async function updateStatusPageLinks(id: string, formData: FormData) {
  const ws = await requireEditor();
  const homepageUrl = (formData.get("homepageUrl") as string | null)?.trim();
  const contactUrl = (formData.get("contactUrl") as string | null)?.trim();
  const parsed = parseOrFlash(
    linksSchema,
    {
      homepageUrl: homepageUrl || undefined,
      contactUrl: contactUrl || undefined,
    },
    `/dashboard/status-pages/${id}/edit`,
  );

  await db()
    .update(schema.statusPages)
    .set({
      homepageUrl: parsed.homepageUrl ?? null,
      contactUrl: parsed.contactUrl ?? null,
      updatedAt: new Date(),
    })
    .where(pageScope(id, ws.workspaceId));

  await logAudit({
    action: "status_page.links_updated",
    targetType: "user",
    targetId: id,
  });

  revalidatePath(`/dashboard/status-pages/${id}/edit`);
  redirect(withToastRedirect(`/dashboard/status-pages/${id}/edit`, "Links saved"));
}

/**
 * Replace the set of monitors visible on a status page in one transaction:
 * delete all existing links, then insert the new selection. Position follows
 * submission order; drag-drop reordering can be layered on top later.
 */
export async function setStatusPageMonitors(id: string, formData: FormData) {
  const ws = await requireEditor();
  const monitorIds = formData.getAll("monitorIds").map(String);
  const parsed = parseOrFlash(
    monitorSelectionSchema,
    { monitorIds },
    `/dashboard/status-pages/${id}`,
  );

  await db().transaction(async (tx) => {
    // Verify the page belongs to the workspace.
    const [page] = await tx
      .select({ id: schema.statusPages.id })
      .from(schema.statusPages)
      .where(pageScope(id, ws.workspaceId))
      .limit(1);
    if (!page) throw new Error("status page not found");

    // Verify every selected monitor lives in this workspace and pull its
    // name/description as the seed for the page-component row (admins can
    // override later via the richer components UI).
    let monitorRows: Array<{ id: string; name: string; description: string | null }> = [];
    if (parsed.monitorIds.length > 0) {
      monitorRows = await tx
        .select({
          id: schema.monitors.id,
          name: schema.monitors.name,
          description: schema.monitors.description,
        })
        .from(schema.monitors)
        .where(
          and(
            inArray(schema.monitors.id, parsed.monitorIds),
            eq(schema.monitors.workspaceId, ws.workspaceId),
          ),
        );
      if (monitorRows.length !== parsed.monitorIds.length) {
        throw new Error("forbidden: monitor not in workspace");
      }
    }

    // Replace ONLY the monitor-typed components — static components have
    // their own lifecycle and shouldn't be wiped by this checkbox list.
    await tx
      .delete(schema.pageComponents)
      .where(
        and(eq(schema.pageComponents.statusPageId, id), eq(schema.pageComponents.type, "monitor")),
      );

    if (parsed.monitorIds.length > 0) {
      const byId = new Map(monitorRows.map((m) => [m.id, m]));
      await tx.insert(schema.pageComponents).values(
        parsed.monitorIds.map((monitorId, position) => {
          const m = byId.get(monitorId);
          return {
            statusPageId: id,
            workspaceId: ws.workspaceId,
            type: "monitor" as const,
            monitorId,
            name: m?.name ?? "",
            description: m?.description ?? null,
            position,
          };
        }),
      );
    }
  });

  await logAudit({
    action: "status_page.monitors_updated",
    targetType: "user",
    targetId: id,
    metadata: { count: parsed.monitorIds.length },
  });

  revalidatePath(`/dashboard/status-pages/${id}/components`);
  redirect(
    withToastRedirect(
      `/dashboard/status-pages/${id}/components`,
      `Updated components (${parsed.monitorIds.length} selected)`,
    ),
  );
}
