"use server";

import { hashPassword } from "@openmonitor/auth/password";
import { db, eq, isReservedSlug, schema } from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "~/auth";
import { parseOrFlash } from "~/lib/zod-flash";

const PATH = "/signup";

/**
 * Self-service signup is opt-in, like RETENTION_ENABLED and NOTIFIER_POLL.
 *
 * A self-hosted deployment wants exactly one workspace and no way for a
 * stranger to add another, so the default has to be "closed" — the same reason
 * there is no signup form in the first place (see packages/auth/CLAUDE.md).
 * Turning it on is a decision by whoever controls the deploy.
 */
export function signupsEnabled(): boolean {
  return process.env.SIGNUPS_ENABLED === "on";
}

const signupSchema = z.object({
  email: z.string().email().max(200),
  // Matches acceptInvite — one password policy, not two.
  password: z.string().min(8).max(200),
  workspaceName: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes only")
    // The slug becomes a hostname under STATUS_PAGE_ROOT_DOMAIN, so it can
    // collide with something the deployment owns.
    .refine((slug) => !isReservedSlug(slug), "That address is reserved"),
});

/**
 * Create an account and its first workspace in one transaction, then sign in.
 *
 * The new user is an admin *of their own workspace only* — `admin` is read from
 * `workspace_members`, so it grants nothing outside it. Instance-wide powers
 * stay behind OPERATOR_EMAILS, which no signup can grant.
 */
export async function signUp(formData: FormData) {
  if (!signupsEnabled()) {
    redirect(withToastRedirect("/login", "Signups are closed on this instance", "error"));
  }

  const parsed = parseOrFlash(signupSchema, Object.fromEntries(formData), PATH);
  const email = parsed.email.toLowerCase();

  // Checked up front so the common mistakes get a readable message. The unique
  // indexes on users.email and workspaces.slug are still the real guard — two
  // simultaneous signups can both pass these reads.
  const [takenEmail] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (takenEmail) {
    redirect(withToastRedirect(PATH, "That email already has an account", "error"));
  }

  const [takenSlug] = await db()
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, parsed.slug))
    .limit(1);
  if (takenSlug) {
    redirect(withToastRedirect(PATH, "That address is already taken", "error"));
  }

  const passwordHash = await hashPassword(parsed.password);

  try {
    await db().transaction(async (tx) => {
      const [user] = await tx
        .insert(schema.users)
        .values({ email, passwordHash, role: "admin", isActive: true })
        .returning({ id: schema.users.id });
      if (!user) throw new Error("failed to create user");

      const [workspace] = await tx
        .insert(schema.workspaces)
        .values({ name: parsed.workspaceName, slug: parsed.slug })
        .returning({ id: schema.workspaces.id });
      if (!workspace) throw new Error("failed to create workspace");

      await tx
        .insert(schema.workspaceMembers)
        .values({ workspaceId: workspace.id, userId: user.id, role: "admin" });

      // Written here rather than through logAudit(): that reads the session for
      // the actor and returns early without one, and at this point the user
      // isn't signed in yet — the call would have silently recorded nothing.
      await tx.insert(schema.auditLogs).values({
        workspaceId: workspace.id,
        actorId: user.id,
        actorEmail: email,
        action: "workspace.created",
        targetType: "user",
        targetId: workspace.id,
        targetLabel: parsed.workspaceName,
        metadata: { slug: parsed.slug, viaSignup: true },
      });
    });
  } catch (err) {
    // Lost the race on one of the unique indexes. Both fields are shown on the
    // form, so a single message pointing at them is enough.
    if (String(err).includes("23505") || /unique/i.test(String(err))) {
      redirect(withToastRedirect(PATH, "That email or address was just taken", "error"));
    }
    throw err;
  }

  // signIn throws a redirect, so it has to be the last thing and outside the
  // transaction.
  await signIn("credentials", {
    email,
    password: parsed.password,
    redirectTo: "/dashboard",
  });
}
