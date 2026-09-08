import type { NextAuthConfig } from "next-auth";
// Importing JWT registers the next-auth/jwt subpath with TypeScript so the
// `declare module "next-auth/jwt"` augmentation below resolves the original
// module.
import type { JWT } from "next-auth/jwt";

export type UserRole = "admin" | "editor" | "viewer";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      /** Role in the user's CURRENT workspace. Source of truth lives in workspace_members. */
      role: UserRole;
      /** UUID of the workspace the user is currently acting in. */
      workspaceId: string;
    };
  }
  interface User {
    role?: UserRole;
    workspaceId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    workspaceId?: string;
  }
}
// Reference JWT so TS retains the import for the augmentation to attach to.
export type EdgeJWT = JWT;

/**
 * Edge-safe Auth.js config.
 *
 * Used by middleware. Contains NO providers (their `authorize` functions hit
 * the DB / argon2, both Node-only) and NO adapter. Middleware only needs the
 * `authorized` callback to redirect unauthenticated users.
 *
 * The full config in `./config` extends this with providers + adapter + a
 * `jwt` callback chain that loads the user's first workspace at sign-in.
 */
export const edgeAuthConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  providers: [],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: UserRole }).role ?? "viewer";
        token.workspaceId = (user as { workspaceId?: string }).workspaceId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (token.role) session.user.role = token.role;
      if (token.workspaceId) session.user.workspaceId = token.workspaceId;
      return session;
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const path = request.nextUrl.pathname;
      // /signup 404s itself when SIGNUPS_ENABLED is off.
      const isPublic =
        path.startsWith("/login") ||
        path.startsWith("/api/auth") ||
        path.startsWith("/invite") ||
        path.startsWith("/signup");
      if (isPublic) return true;
      return isLoggedIn;
    },
  },
};
