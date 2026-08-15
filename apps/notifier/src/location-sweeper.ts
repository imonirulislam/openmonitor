import { db, eq, rows, schema, sql } from "@openmonitor/db";

/**
 * Probe-location sweeper. Emits `location.silent` when an enabled location has
 * stopped reporting, and `location.recovered` when it starts again.
 *
 * `last_seen_at` is bumped on every probe ingest. Without this sweep a checker
 * that died looked exactly like a service nobody was probing — results just
 * stopped arriving, and the monitors it covered quietly fell back to whatever
 * the remaining regions said.
 *
 * The threshold is derived per location, not fixed: a location only reports as
 * often as its slowest assigned monitor is checked, so one probing a 120s
 * monitor is legitimately quiet for 120s at a time. Allowing two missed cycles
 * plus a grace margin means a location covering fast monitors is detected
 * quickly without a location covering slow ones flapping. `graceSeconds` is the
 * floor for locations with no assigned monitors.
 *
 * Locations that have never reported are skipped: that's a setup problem, not an
 * outage, and alerting would fire the moment someone creates one.
 *
 * Idempotent via `silent_alerted_at` — set when we alert, cleared on recovery —
 * so a location that stays down produces one event, not one per tick.
 */
export async function sweepProbeLocations(
  graceSeconds: number,
): Promise<{ silenced: number; recovered: number }> {
  const conn = db();

  const gone = rows<{
    id: string;
    name: string;
    region: string;
    last_seen_at: string | Date;
  }>(
    await conn.execute(sql`
    with thresholds as (
      select
        p.id,
        coalesce(max(m.interval_seconds) * 2, 0) + ${graceSeconds} as silent_after
      from probe_locations p
      left join probe_location_monitors plm on plm.probe_location_id = p.id
      left join monitors m on m.id = plm.monitor_id and m.enabled = true
      group by p.id
    )
    select p.id, p.name, p.region, p.last_seen_at
    from probe_locations p
    join thresholds t on t.id = p.id
    where p.enabled = true
      and p.silent_alerted_at is null
      and p.last_seen_at is not null
      and p.last_seen_at < now() - t.silent_after * INTERVAL '1 second'
  `),
  );

  let silenced = 0;
  for (const row of gone) {
    await conn.transaction(async (tx) => {
      // Route to the channels of the monitors this location covers — the people
      // who care about those monitors are the ones who need to know a region
      // went dark. Matches how incident.* events route.
      const assigned = await tx
        .select({
          monitorId: schema.monitors.id,
          name: schema.monitors.name,
          workspaceId: schema.monitors.workspaceId,
        })
        .from(schema.probeLocationMonitors)
        .innerJoin(schema.monitors, eq(schema.monitors.id, schema.probeLocationMonitors.monitorId))
        .where(eq(schema.probeLocationMonitors.probeLocationId, row.id));

      const lastSeen = new Date(row.last_seen_at);
      await tx
        .update(schema.probeLocations)
        .set({ silentAlertedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.probeLocations.id, row.id));

      // A shared location spans workspaces, so emit one event per workspace and
      // scope each payload to that workspace's monitors. Emitting a single event
      // would leak one tenant's monitor names into another's Slack channel.
      const byWorkspace = new Map<string, typeof assigned>();
      for (const a of assigned) {
        const list = byWorkspace.get(a.workspaceId) ?? [];
        list.push(a);
        byWorkspace.set(a.workspaceId, list);
      }

      for (const [workspaceId, monitors] of byWorkspace) {
        await tx.insert(schema.events).values({
          workspaceId,
          type: "location.silent",
          payload: {
            location: { id: row.id, name: row.name, region: row.region },
            monitorIds: monitors.map((m) => m.monitorId),
            monitorNames: monitors.map((m) => m.name),
            lastSeenAt: lastSeen.toISOString(),
            silentForMs: Date.now() - lastSeen.getTime(),
          },
        });
      }
      silenced++;
    });
  }

  const back = rows<{
    id: string;
    name: string;
    region: string;
    last_seen_at: string | Date;
    silent_alerted_at: string | Date;
  }>(
    await conn.execute(sql`
    with thresholds as (
      select
        p.id,
        coalesce(max(m.interval_seconds) * 2, 0) + ${graceSeconds} as silent_after
      from probe_locations p
      left join probe_location_monitors plm on plm.probe_location_id = p.id
      left join monitors m on m.id = plm.monitor_id and m.enabled = true
      group by p.id
    )
    select p.id, p.name, p.region, p.last_seen_at, p.silent_alerted_at
    from probe_locations p
    join thresholds t on t.id = p.id
    where p.silent_alerted_at is not null
      and p.last_seen_at is not null
      and p.last_seen_at >= now() - t.silent_after * INTERVAL '1 second'
  `),
  );

  let recovered = 0;
  for (const row of back) {
    await conn.transaction(async (tx) => {
      const assigned = await tx
        .select({
          monitorId: schema.monitors.id,
          name: schema.monitors.name,
          workspaceId: schema.monitors.workspaceId,
        })
        .from(schema.probeLocationMonitors)
        .innerJoin(schema.monitors, eq(schema.monitors.id, schema.probeLocationMonitors.monitorId))
        .where(eq(schema.probeLocationMonitors.probeLocationId, row.id));

      await tx
        .update(schema.probeLocations)
        .set({ silentAlertedAt: null, updatedAt: new Date() })
        .where(eq(schema.probeLocations.id, row.id));

      const silentSince = new Date(row.silent_alerted_at);
      const byWorkspace = new Map<string, typeof assigned>();
      for (const a of assigned) {
        const list = byWorkspace.get(a.workspaceId) ?? [];
        list.push(a);
        byWorkspace.set(a.workspaceId, list);
      }

      for (const [workspaceId, monitors] of byWorkspace) {
        await tx.insert(schema.events).values({
          workspaceId,
          type: "location.recovered",
          payload: {
            location: { id: row.id, name: row.name, region: row.region },
            monitorIds: monitors.map((m) => m.monitorId),
            monitorNames: monitors.map((m) => m.name),
            lastSeenAt: new Date(row.last_seen_at).toISOString(),
            silentForMs: Date.now() - silentSince.getTime(),
          },
        });
      }
      recovered++;
    });
  }

  return { silenced, recovered };
}
