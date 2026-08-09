import { db, eq, schema } from "@openmonitor/db";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { verifyPassword } from "./password";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Credentials (email + password) provider — primary auth method for v1.
 * SSO providers (Google, JumpCloud OIDC, …) are added by appending entries
 * to the `providers` array. Each one uses the same Drizzle adapter, so
 * users authenticated via SSO get rows in the `accounts` table automatically.
 */
export function buildProviders(): Provider[] {
  const providers: Provider[] = [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const [user] = await db()
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, email.toLowerCase()))
          .limit(1);

        if (!user || !user.passwordHash || !user.isActive) return null;
        const ok = await verifyPassword(user.passwordHash, password);
        if (!ok) return null;

        // Load the user's first workspace + role from workspace_members. If
        // they have no membership yet, sign-in fails — admins must invite
        // them into a workspace first.
        const [membership] = await db()
          .select({
            workspaceId: schema.workspaceMembers.workspaceId,
            role: schema.workspaceMembers.role,
          })
          .from(schema.workspaceMembers)
          .where(eq(schema.workspaceMembers.userId, user.id))
          .limit(1);

        if (!membership) return null;

        // Best-effort lastLoginAt update; failure shouldn't block login.
        try {
          await db()
            .update(schema.users)
            .set({ lastLoginAt: new Date() })
            .where(eq(schema.users.id, user.id));
        } catch {}

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          image: user.image ?? undefined,
          role: membership.role,
          workspaceId: membership.workspaceId,
        };
      },
    }),

    // ---- SSO providers — uncomment + configure to enable ----
    //
    // Google:
    //   import Google from "next-auth/providers/google";
    //   Google({
    //     clientId: process.env.AUTH_GOOGLE_ID!,
    //     clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    //     allowDangerousEmailAccountLinking: true, // link to existing user by email
    //   }),
    //
    // JumpCloud (generic OIDC):
    //   {
    //     id: "jumpcloud",
    //     name: "JumpCloud",
    //     type: "oidc",
    //     issuer: process.env.AUTH_JUMPCLOUD_ISSUER!,
    //     clientId: process.env.AUTH_JUMPCLOUD_ID!,
    //     clientSecret: process.env.AUTH_JUMPCLOUD_SECRET!,
    //     authorization: { params: { scope: "openid email profile" } },
    //   },
  ];

  return providers;
}
