import NextAuth from "next-auth";
import { edgeAuthConfig } from "@openmonitor/auth/edge";

// Middleware runs in the Edge runtime. We instantiate NextAuth here with the
// Edge-safe config (no providers, no adapter) so we don't pull in argon2 or
// postgres. This middleware only redirects unauthenticated users via the
// `authorized` callback.
const { auth } = NextAuth(edgeAuthConfig);

export default auth;

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
