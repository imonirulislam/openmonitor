"use server";

import { and, db, eq, isReservedSlug, schema } from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "~/auth";
import { logAudit } from "~/lib/audit";
import {
  getCurrentWorkspace,
  WORKSPACE_COOKIE_MAX_AGE,
  WORKSPACE_COOKIE_NAME,
} from "~/lib/workspace";
import { parseOrFlash } from "~/lib/zod-flash";

const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and dashes only")
  // A workspace slug becomes a hostname under STATUS_PAGE_ROOT_DOMAIN, and a
  // page slug becomes a path segment. Both can collide with something we own.
  .refine((slug) => !isReservedSlug(slug), "That slug is reserved");

const renameSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema,
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema,
});

async function requireAdmin() {
  const ws = await getCurrentWorkspace();
  if (ws.role !== "admin") throw new Error("forbidden: admin role required");
  return ws;
}

/**
 * Set the cookie that overrides which workspace the user is currently acting
 * in. Called by the sidebar workspace switcher. Verifies membership before
 * setting so a hand-poked cookie can't grant access.
 */
export async function switchWorkspace(workspaceId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");

  const [m] = await db()
    .select({ workspaceId: schema.workspaceMembers.workspaceId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.userId, session.user.id),
        eq(schema.workspaceMembers.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!m) throw new Error("forbidden: not a member of that workspace");

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE_NAME, workspaceId, {
    path: "/",
    maxAge: WORKSPACE_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
  });

  // Reload the dashboard so server components re-render with the new workspace.
  redirect("/");
}

export async function createWorkspace(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const parsed = parseOrFlash(
    createSchema,
    Object.fromEntries(formData),
    "/settings/workspace?new=1",
  );

  const workspaceId = await db().transaction(async (tx) => {
    const [w] = await tx
      .insert(schema.workspaces)
      .values({ name: parsed.name, slug: parsed.slug })
      .returning({ id: schema.workspaces.id });
    if (!w) throw new Error("failed to create workspace");
    await tx.insert(schema.workspaceMembers).values({
      workspaceId: w.id,
      userId: session.user.id,
      role: "admin",
    });
    return w.id;
  });

  await logAudit({
    action: "workspace.created",
    targetType: "user", // bit of a stretch — workspace targetType isn't enumerated
    targetId: workspaceId,
    targetLabel: parsed.name,
    metadata: { slug: parsed.slug },
  });

  // Switch to the new workspace right away.
  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE_NAME, workspaceId, {
    path: "/",
    maxAge: WORKSPACE_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
  });

  revalidatePath("/");
  redirect(withToastRedirect("/", `Created workspace “${parsed.name}”`));
}

export async function renameWorkspace(formData: FormData) {
  const ws = await requireAdmin();
  const parsed = parseOrFlash(renameSchema, Object.fromEntries(formData), "/settings/workspace");

  await db()
    .update(schema.workspaces)
    .set({ name: parsed.name, slug: parsed.slug, updatedAt: new Date() })
    .where(eq(schema.workspaces.id, ws.workspaceId));

  await logAudit({
    action: "workspace.updated",
    targetType: "user",
    targetId: ws.workspaceId,
    targetLabel: parsed.name,
    metadata: { slug: parsed.slug },
  });

  revalidatePath("/settings/workspace");
  redirect(withToastRedirect("/settings/workspace", "Workspace updated"));
}

export async function deleteWorkspace(): Promise<void> {
  const ws = await requireAdmin();

  // Refuse to delete the very last workspace someone is in. They'd lose access
  // to everything; we'd rather make them create another one first.
  const session = await auth();
  if (!session?.user?.id) throw new Error("unauthorized");
  const memberships = await db()
    .select({ id: schema.workspaceMembers.workspaceId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, session.user.id));
  if (memberships.length <= 1) {
    throw new Error("cannot delete your only workspace");
  }

  const [target] = await db()
    .select({ name: schema.workspaces.name })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, ws.workspaceId))
    .limit(1);

  await db().delete(schema.workspaces).where(eq(schema.workspaces.id, ws.workspaceId));

  await logAudit({
    action: "workspace.deleted",
    targetType: "user",
    targetId: ws.workspaceId,
    targetLabel: target?.name ?? null,
  });

  // Clear the override cookie so the user falls back to one of their others.
  const cookieStore = await cookies();
  cookieStore.delete(WORKSPACE_COOKIE_NAME);

  redirect(withToastRedirect("/", "Workspace deleted", "info"));
}
