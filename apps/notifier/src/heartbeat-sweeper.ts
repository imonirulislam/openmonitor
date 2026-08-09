import { db, eq, schema, sql } from "@openmonitor/db";

/**
 * Heartbeat sweeper. For each enabled push-based monitor, flips status to
 * "down" and emits a `monitor.down` event when the next ping is overdue.
 *
 * Overdue = `now() > coalesce(last_ping_at, created_at) + (expected_interval_seconds + grace_seconds)`
 *
 * Idempotent: only flips when the previous status wasn't already "down" so
 * we don't keep re-emitting events on every tick.
 */
export async function sweepHeartbeats(): Promise<{ tripped: number }> {
  const conn = db();

  // Find heartbeats that are now overdue but not yet marked "down".
  const overdue = await conn.execute(sql`
    select
      id,
      workspace_id,
      slug,
      name
    from heartbeat_monitors
    where enabled = true
      and current_status <> 'down'
      and (
        coalesce(last_ping_at, created_at)
          + (expected_interval_seconds + grace_seconds) * INTERVAL '1 second'
      ) < now()
  `);

  const rows = overdue as unknown as Array<{
    id: string;
    workspace_id: string;
    slug: string;
    name: string;
  }>;

  let tripped = 0;
  for (const r of rows) {
    await conn.transaction(async (tx) => {
      await tx
        .update(schema.heartbeatMonitors)
        .set({ currentStatus: "down", updatedAt: new Date() })
        .where(eq(schema.heartbeatMonitors.id, r.id));

      await tx.insert(schema.events).values({
        workspaceId: r.workspace_id,
        type: "monitor.down",
        payload: {
          monitor: { id: r.id, slug: r.slug, name: r.name, url: "" },
          region: "heartbeat",
          error: "ping overdue",
          statusCode: null,
          checkedAt: new Date().toISOString(),
        },
      });
    });
    tripped += 1;
  }

  return { tripped };
}
