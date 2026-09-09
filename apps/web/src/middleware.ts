import { edgeAuthConfig } from "@openmonitor/auth/edge";
import NextAuth, { type NextAuthResult } from "next-auth";

// Middleware runs in the Edge runtime. We instantiate NextAuth here with the
// Edge-safe config (no providers, no adapter) so we don't pull in argon2 or
// postgres. This middleware only redirects unauthenticated users via the
// `authorized` callback.
//
// Annotated for the same reason as src/auth.ts — TS2742 under the hoisted
// node_modules layout.
const nextAuth = NextAuth(edgeAuthConfig);
const auth: NextAuthResult["auth"] = nextAuth.auth;

export default auth;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
