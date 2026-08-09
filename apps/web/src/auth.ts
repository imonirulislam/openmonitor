import NextAuth from "next-auth";
import { authConfig } from "@openmonitor/auth";

export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);
