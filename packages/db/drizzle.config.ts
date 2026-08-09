import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit transpiles this file to CJS, so import.meta is unavailable.
// process.cwd() is always packages/db/ when drizzle-kit runs, so the workspace .env
// is two levels up.
config({ path: path.resolve(process.cwd(), "../../.env") });


const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set for drizzle-kit");
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
