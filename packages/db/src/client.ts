import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 30,
  });
  return drizzle(client, { schema, casing: "snake_case" });
}

let cached: Database | undefined;

// Lazy singleton for app code. Tests/migrations should call createDb directly.
export function db(): Database {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL must be set");
    cached = createDb(url);
  }
  return cached;
}
