"use server";

import { hashPassword, verifyPassword } from "@openmonitor/auth/password";
import { and, db, eq, schema } from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "~/auth";
import { logAudit } from "~/lib/audit";
import { getCurrentWorkspace } from "~/lib/workspace";
import { parseOrFlash } from "~/lib/zod-flash";

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session;
}

async function requireAdmin() {
  const ws = await getCurrentWorkspace();
  if (ws.role !== "admin") throw new Error("forbidden: admin role required");
  return ws;
}

// ---------- Account self-service ----------

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(200),
    confirmPassword: z.string().min(8).max(200),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "passwords don't match",
    path: ["confirmPassword"],
  });

export async function changeOwnPassword(formData: FormData) {
  const session = await requireSession();
  const parsed = parseOrFlash(
    changePasswordSchema,
    Object.fromEntries(formData),
    "/settings/account",
  );

  const [user] = await db()
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);
  if (!user || !user.passwordHash) throw new Error("password not set on this account");

  const ok = await verifyPassword(user.passwordHash, parsed.currentPassword);
  if (!ok) {
    redirect(withToastRedirect("/settings/account", "Current password is incorrect", "error"));
  }

  const newHash = await hashPassword(parsed.newPassword);
  await db()
    .update(schema.users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(schema.users.id, session.user.id));

  await logAudit({
    action: "user.password_changed",
    targetType: "user",
    targetId: session.user.id,
    targetLabel: session.user.email ?? null,
  });

  redirect(withToastRedirect("/settings/account", "Password updated"));
}

// ---------- Member management (admin only) ----------

const inviteSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(200).optional(),
  role: z.enum(["admin", "editor", "viewer"]),
});

const changeRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "editor", "viewer"]),
});

/**
 * Create a new user (or attach existing user to current workspace) and return
 * a one-time invite link. The recipient visits /invite/<token> to set their
 * password and finalize the account.
 *
 * The user row is created with `is_active = false` and no password hash; only
 * after they complete the invite flow does their account become usable. This
 * means leaking an invite link doesn't grant access until consumed.
 */
export async function inviteMember(formData: FormData) {
  const ws = await requireAdmin();
  const parsed = parseOrFlash(inviteSchema, Object.fromEntries(formData), "/settings/members");
  const email = parsed.email.toLowerCase();

  await db().transaction(async (tx) => {
    let userId: string;
    const [existing] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (existing) {
      userId = existing.id;
    } else {
      const [created] = await tx
        .insert(schema.users)
        .values({
          email,
          name: parsed.name ?? null,
          role: "viewer",
          isActive: false, // becomes active once they consume the invite
        })
        .returning({ id: schema.users.id });
      if (!created) throw new Error("failed to create user");
      userId = created.id;
    }

    // Add membership at the requested role; idempotent on (workspace, user).
    await tx
      .insert(schema.workspaceMembers)
      .values({ workspaceId: ws.workspaceId, userId, role: parsed.role })
      .onConflictDoUpdate({
        target: [schema.workspaceMembers.workspaceId, schema.workspaceMembers.userId],
        set: { role: parsed.role },
      });

    // Generate a verification token. Identifier encodes which workspace this
    // invite is for so consuming the token at /invite/[token] knows what to
    // attach to and at what role.
    const token = generateToken();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await tx.insert(schema.verificationTokens).values({
      identifier: `invite:${ws.workspaceId}:${userId}:${parsed.role}`,
      token,
      expires,
    });

    await logAudit({
      action: "user.invited",
      targetType: "user",
      targetId: userId,
      targetLabel: email,
      metadata: { role: parsed.role, hasExistingAccount: !!existing },
    });

    // Pass the token back to the page through a flash search param so the
    // admin can copy the link.
    redirect(
      withToastRedirect(
        `/settings/members?invited=${userId}&token=${token}`,
        existing ? `Added ${email} to the workspace` : `Invited ${email} — share the link below`,
      ),
    );
  });
}

export async function changeMemberRole(formData: FormData) {
  const ws = await requireAdmin();
  const parsed = parseOrFlash(changeRoleSchema, Object.fromEntries(formData), "/settings/members");

  await db()
    .update(schema.workspaceMembers)
    .set({ role: parsed.role })
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, ws.workspaceId),
        eq(schema.workspaceMembers.userId, parsed.userId),
      ),
    );

  await logAudit({
    action: "user.role_changed",
    targetType: "user",
    targetId: parsed.userId,
    metadata: { role: parsed.role },
  });

  redirect(withToastRedirect("/settings/members", "Role updated"));
}

export async function removeMember(userId: string): Promise<void> {
  const ws = await requireAdmin();
  if (userId === ws.userId) throw new Error("can't remove yourself");

  await db()
    .delete(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, ws.workspaceId),
        eq(schema.workspaceMembers.userId, userId),
      ),
    );

  await logAudit({
    action: "user.removed",
    targetType: "user",
    targetId: userId,
  });

  revalidatePath("/settings/members");
  redirect(withToastRedirect("/settings/members", "Member removed", "info"));
}

export async function setUserActive(userId: string, active: boolean): Promise<void> {
  await requireAdmin();

  await db()
    .update(schema.users)
    .set({ isActive: active, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));

  await logAudit({
    action: active ? "user.reactivated" : "user.deactivated",
    targetType: "user",
    targetId: userId,
  });

  revalidatePath("/settings/members");
  redirect(
    withToastRedirect(
      "/settings/members",
      active ? "User reactivated" : "User deactivated",
      active ? "success" : "info",
    ),
  );
}

// ---------- Invite consumption (public — no auth) ----------

const acceptInviteSchema = z
  .object({
    name: z.string().min(1).max(200),
    password: z.string().min(8).max(200),
    confirmPassword: z.string().min(8).max(200),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "passwords don't match",
    path: ["confirmPassword"],
  });

export async function acceptInvite(token: string, formData: FormData) {
  const parsed = parseOrFlash(acceptInviteSchema, Object.fromEntries(formData), `/invite/${token}`);

  // Look up the verification token. Identifier format:
  // invite:<workspace_id>:<user_id>:<role>
  const [row] = await db()
    .select()
    .from(schema.verificationTokens)
    .where(eq(schema.verificationTokens.token, token))
    .limit(1);
  if (!row) throw new Error("invite not found");
  if (row.expires < new Date()) throw new Error("invite expired");

  // identifier format: invite:<workspace_id>:<user_id>:<role>
  const [tag, , userId] = row.identifier.split(":");
  if (tag !== "invite" || !userId) {
    throw new Error("invalid invite token");
  }

  const newHash = await hashPassword(parsed.password);

  await db().transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({
        name: parsed.name,
        passwordHash: newHash,
        isActive: true,
        emailVerified: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId));

    await tx
      .delete(schema.verificationTokens)
      .where(
        and(
          eq(schema.verificationTokens.identifier, row.identifier),
          eq(schema.verificationTokens.token, token),
        ),
      );
  });

  // Send the user to /login with a toast prompting them to sign in. We don't
  // auto-sign-in because Auth.js's signIn() can't easily be invoked from a
  // server action without a request body in the right shape.
  redirect(withToastRedirect("/login", "Account ready — sign in with your new password"));
}

function generateToken(): string {
  // 32 random bytes, base64url. Crypto-strong, URL-safe.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
