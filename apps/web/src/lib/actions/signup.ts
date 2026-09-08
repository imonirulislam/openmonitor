"use server";

import { hashPassword } from "@openmonitor/auth/password";
import { db, eq, isReservedSlug, schema } from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "~/auth";
import { parseOrFlash } from "~/lib/zod-flash";

const PATH = "/signup";

/** Opt-in: a self-hosted deployment shouldn't let a stranger add a workspace. */
export function signupsEnabled(): boolean {
  return process.env.SIGNUPS_ENABLED === "on";
}

const signupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200), // same policy as acceptInvite
  workspaceName: z.string().min(1).max(200),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes only")
    .refine((slug) => !isReservedSlug(slug), "That address is reserved"),
});

/**
 * Account + first workspace in one transaction, then sign in. `admin` here is
 * admin of that workspace only; OPERATOR_EMAILS stays out of reach.
 */
export async function signUp(formData: FormData) {
  if (!signupsEnabled()) {
    redirect(withToastRedirect("/login", "Signups are closed on this instance", "error"));
  }

  const parsed = parseOrFlash(signupSchema, Object.fromEntries(formData), PATH);
  const email = parsed.email.toLowerCase();

  // Readable messages for the common case; the unique indexes are the real guard.
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

      // Not logAudit() — it takes the actor from the session, and there isn't one yet.
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
    if (String(err).includes("23505") || /unique/i.test(String(err))) {
      redirect(withToastRedirect(PATH, "That email or address was just taken", "error"));
    }
    throw err;
  }

  // Throws a redirect, so it goes last.
  await signIn("credentials", { email, password: parsed.password, redirectTo: "/dashboard" });
}
