import { DrizzleAdapter } from "@auth/drizzle-adapter";
import type { NextAuthConfig } from "next-auth";
import { db, schema } from "@openmonitor/db";
import { edgeAuthConfig } from "./edge-config";
import { buildProviders } from "./providers";

export type { UserRole } from "./edge-config";

/**
 * Full Auth.js config — used everywhere except middleware. Pulls in the
 * Drizzle adapter (postgres = Node-only) and the Credentials provider
 * (argon2 = Node-only). Middleware uses `edgeAuthConfig` instead.
 */
export const authConfig: NextAuthConfig = {
  ...edgeAuthConfig,
  adapter: DrizzleAdapter(db(), {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers: buildProviders(),
};
