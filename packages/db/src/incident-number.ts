import { sql } from "drizzle-orm";
import { rows } from "./raw";

/**
 * Allocate the next incident number for a workspace.
 *
 * Must be called inside the transaction that inserts the incident.
 *
 * `max(number) + 1` on its own races: two incidents opening at the same moment
 * — which is exactly what a multi-region outage produces, one auto-incident per
 * failing monitor — would read the same maximum and collide on
 * `incidents_workspace_number_unique`. The advisory lock serialises numbering
 * per workspace and is released on commit, so the contention is limited to the
 * workspace actually opening an incident.
 *
 * `hashtext` because advisory locks key on bigint, not uuid. A hash collision
 * between two workspaces would only mean one briefly waits for the other.
 */
export async function nextIncidentNumber(
  // Accepts a transaction or a connection; both expose `execute`.
  tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> },
  workspaceId: string,
): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${workspaceId}))`);
  const result = await tx.execute(
    sql`select coalesce(max(number), 0) + 1 as next from incidents where workspace_id = ${workspaceId}`,
  );
  // biome-ignore lint/suspicious/noExplicitAny: execute() is typed per-driver; rows() narrows it.
  const [row] = rows<{ next: number | string }>(result as any);
  return Number(row?.next ?? 1);
}
