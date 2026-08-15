import type { QueryResult, QueryResultRow } from "@neondatabase/serverless";

/**
 * Accessors for raw `db.execute(sql`…`)` results.
 *
 * Drizzle only maps rows for queries built through its query builder; `execute`
 * hands back whatever the underlying driver returned. That shape is
 * driver-specific — postgres-js returns an array carrying a `.count`, the Neon
 * and node-postgres drivers return `{ rows, rowCount }` — and every call site
 * used to reach into it behind an `as unknown as` cast, which compiles happily
 * against the wrong driver and only fails at runtime.
 *
 * Going through these two functions keeps that knowledge in one file. The cast
 * to the caller's row type stays at the call site, because only the caller
 * knows what its SQL selected.
 */

/** Rows from a raw SELECT (or a DML statement with RETURNING). */
export function rows<T>(result: QueryResult<QueryResultRow>): T[] {
  return result.rows as T[];
}

/** How many rows a raw INSERT/UPDATE/DELETE touched. */
export function affected(result: QueryResult<QueryResultRow>): number {
  return result.rowCount ?? 0;
}
