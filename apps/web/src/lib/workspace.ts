import type { UserRole } from "@openmonitor/db";
import { and, db, eq, schema } from "@openmonitor/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "~/auth";

const COOKIE_NAME = "openmonitor_workspace_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Resolve the current workspace.
 *
 * Order of preference:
 *   1. The `openmonitor_workspace_id` cookie (set by the workspace switcher),
 *      if the signed-in user is actually a member of that workspace. Cookie-
 *      based override means the user can switch without re-issuing the JWT.
 *   2. The `workspaceId` baked into the session at sign-in (their first
 *      membership at the moment they logged in).
 *
 * Returns the workspace id and the user's role *in that workspace* (not the
 * JWT-bound role, which can be stale after switching).
 */
export async function getCurrentWorkspace(): Promise<{
  workspaceId: string;
  role: UserRole;
  userId: string;
  email: string;
}> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) redirect("/login");

  const cookieStore = await cookies();
  const override = cookieStore.get(COOKIE_NAME)?.value;

  if (override) {
    const [m] = await db()
      .select({
        workspaceId: schema.workspaceMembers.workspaceId,
        role: schema.workspaceMembers.role,
      })
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.userId, session.user.id),
          eq(schema.workspaceMembers.workspaceId, override),
        ),
      )
      .limit(1);
    if (m) {
      return {
        workspaceId: m.workspaceId,
        role: m.role,
        userId: session.user.id,
        email: session.user.email,
      };
    }
    // Cookie points to a workspace the user no longer belongs to — fall through.
  }

  if (!session.user.workspaceId) redirect("/login");

  // Re-read role for the JWT-bound workspace so it reflects any role changes
  // since sign-in.
  const [m] = await db()
    .select({ role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.userId, session.user.id),
        eq(schema.workspaceMembers.workspaceId, session.user.workspaceId),
      ),
    )
    .limit(1);
  if (!m) redirect("/login");

  return {
    workspaceId: session.user.workspaceId,
    role: m.role,
    userId: session.user.id,
    email: session.user.email,
  };
}

/** Convenience wrapper for routes that just need the workspace id. */
export async function getCurrentWorkspaceId(): Promise<string> {
  return (await getCurrentWorkspace()).workspaceId;
}

/** List the workspaces the signed-in user belongs to. */
export async function getUserWorkspaces(): Promise<
  Array<{ id: string; slug: string; name: string; role: UserRole }>
> {
  const session = await auth();
  if (!session?.user?.id) return [];
  return await db()
    .select({
      id: schema.workspaces.id,
      slug: schema.workspaces.slug,
      name: schema.workspaces.name,
      role: schema.workspaceMembers.role,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(eq(schema.workspaceMembers.userId, session.user.id));
}

export const WORKSPACE_COOKIE_NAME = COOKIE_NAME;
export const WORKSPACE_COOKIE_MAX_AGE = COOKIE_MAX_AGE;
