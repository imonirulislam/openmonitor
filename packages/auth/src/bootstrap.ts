import "@openmonitor/db/load-env";
import { randomBytes } from "node:crypto";
import { and, createDb, eq, isReservedSlug, schema } from "@openmonitor/db";
import { hashPassword } from "./password";

/**
 * Create the first workspace and admin user on an empty database.
 *
 * There is no signup route — this is a self-hosted tool, and an open
 * registration form on a fresh deployment is a way to lose it. The seed isn't
 * an option either: it writes demo monitors, a published password and probe
 * tokens whose values are in the repository.
 *
 * Lives in @openmonitor/auth rather than @openmonitor/db because it needs the
 * password hasher, and auth already depends on db — the other direction would
 * be a cycle.
 *
 * Idempotent. Re-running with an existing email leaves the password alone and
 * only ensures the workspace membership, so it's safe in a deploy script.
 *
 *   ADMIN_EMAIL=you@example.com bun run --filter @openmonitor/auth bootstrap
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set");

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("ADMIN_EMAIL must be set");

  const workspaceName = process.env.WORKSPACE_NAME ?? "Default";
  const workspaceSlug = (process.env.WORKSPACE_SLUG ?? "default").toLowerCase();
  if (isReservedSlug(workspaceSlug)) {
    throw new Error(`WORKSPACE_SLUG "${workspaceSlug}" is reserved — pick another`);
  }

  // Generated unless supplied, so the common path can't end up with a password
  // someone typed twice and will reuse. Printed once; nothing stores it.
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString("base64url");

  const db = createDb(url);

  const [workspace] = await db
    .insert(schema.workspaces)
    .values({ name: workspaceName, slug: workspaceSlug })
    .onConflictDoUpdate({
      target: schema.workspaces.slug,
      set: { name: workspaceName, updatedAt: new Date() },
    })
    .returning({ id: schema.workspaces.id, slug: schema.workspaces.slug });
  if (!workspace) throw new Error("failed to create workspace");

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  let userId: string;
  if (existing) {
    userId = existing.id;
    console.log(`User ${email} already exists — leaving the password unchanged.`);
  } else {
    const [created] = await db
      .insert(schema.users)
      .values({
        email,
        name: process.env.ADMIN_NAME ?? null,
        passwordHash: await hashPassword(password),
        role: "admin",
      })
      .returning({ id: schema.users.id });
    if (!created) throw new Error("failed to create user");
    userId = created.id;
  }

  const [membership] = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspace.id),
        eq(schema.workspaceMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    await db
      .insert(schema.workspaceMembers)
      .values({ workspaceId: workspace.id, userId, role: "admin" });
  }

  console.log(`Workspace: ${workspace.slug}`);
  console.log(`Admin:     ${email}`);
  if (!existing) {
    console.log(generated ? `Password:  ${password}   (shown once)` : "Password:  as supplied");
  }
  console.log("");
  console.log("Set OPERATOR_EMAILS on apps/web to this address so it can manage");
  console.log("shared probe locations — workspace admin alone is not enough.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
