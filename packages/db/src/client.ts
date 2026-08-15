import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { configureNeon } from "./neon";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDb>;

/**
 * `max` is small on purpose. Every serverless invocation gets its own pool, so
 * the limit that matters is Neon's account-wide connection ceiling, not the
 * throughput of any one instance. Long-running containers (the checker's
 * companion services, docker compose) raise it via DATABASE_POOL_MAX.
 */
export function createDb(
  databaseUrl: string,
  poolMax = Number(process.env.DATABASE_POOL_MAX ?? 5),
) {
  configureNeon();
  const pool = new Pool({
    connectionString: databaseUrl,
    max: poolMax,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 30_000,
  });
  return drizzle(pool, { schema, casing: "snake_case" });
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
