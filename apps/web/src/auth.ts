import { authConfig } from "@openmonitor/auth";
import NextAuth, { type NextAuthResult } from "next-auth";

// Annotated rather than destructured. The inferred types reference next-auth's
// internal `lib/` paths, and the hoisted node_modules layout puts those above
// apps/web, so TS can't name them portably — TS2742. See bunfig.toml.
const nextAuth = NextAuth(authConfig);

export const auth: NextAuthResult["auth"] = nextAuth.auth;
export const handlers: NextAuthResult["handlers"] = nextAuth.handlers;
export const signIn: NextAuthResult["signIn"] = nextAuth.signIn;
export const signOut: NextAuthResult["signOut"] = nextAuth.signOut;
