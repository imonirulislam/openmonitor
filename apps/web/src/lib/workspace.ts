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

/**
 * The signed-in user's profile row. Read from the database rather than the
 * JWT, whose `name` is frozen at sign-in and would go stale on rename.
 */
export async function getCurrentUser(): Promise<{
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [user] = await db()
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      image: schema.users.image,
      lastLoginAt: schema.users.lastLoginAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
  if (!user) redirect("/login");
  return user;
}

export type CurrentWorkspace = Awaited<ReturnType<typeof getCurrentWorkspace>>;

/**
 * Editor-or-better in the workspace the user is *looking at*.
 *
 * Every write goes through here rather than reading the session directly: the
 * JWT's workspaceId and role are whatever they were at sign-in, so a switched
 * workspace would write rows into the previous one and be gated on the
 * previous role.
 */
export async function requireEditor(): Promise<CurrentWorkspace> {
  const ws = await getCurrentWorkspace();
  if (ws.role === "viewer") throw new Error("forbidden: editor role required");
  return ws;
}

/** Admin of the current workspace. */
export async function requireAdmin(): Promise<CurrentWorkspace> {
  const ws = await getCurrentWorkspace();
  if (ws.role !== "admin") throw new Error("forbidden: admin role required");
  return ws;
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
