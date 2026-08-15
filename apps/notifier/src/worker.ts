import { and, db, eq, inArray, rows, schema, sql } from "@openmonitor/db";
import { renderSlackMessage, sendSlack } from "@openmonitor/notifications";

const MAX_ATTEMPTS = 6;
const BATCH_SIZE = 25;

// Exponential backoff in seconds, capped at 10 minutes.
function backoffSeconds(attempts: number): number {
  return Math.min(2 ** attempts, 600);
}

export async function processBatch(): Promise<{ processed: number; failed: number }> {
  const conn = db();
  // Claim a batch of pending events ready to attempt. SKIP LOCKED keeps multiple notifier
  // replicas safe; pushing next_attempt_at forward means a crashed worker's events become
  // available again after the holding window without needing a separate "in_flight" status.
  // Use Postgres now() rather than passing a JS Date — the driver's raw sql.execute path
  // doesn't bind Date objects.
  const claimed = await conn.execute(sql`
    update events
    set attempts = attempts + 1,
        next_attempt_at = now() + interval '60 seconds'
    where id in (
      select id from events
      where status = 'pending' and next_attempt_at <= now()
      order by created_at asc
      limit ${BATCH_SIZE}
      for update skip locked
    )
    returning *
  `);

  const claimedRows = rows<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
    attempts: number;
  }>(claimed);

  let processed = 0;
  let failed = 0;

  for (const event of claimedRows) {
    const payload = event.payload;
    const monitorId = (payload.monitor as { id?: string } | undefined)?.id;
    const incidentMonitorIds = Array.isArray(payload.monitorIds)
      ? (payload.monitorIds as string[])
      : null;

    // Resolve target channels: monitor-linked channels for monitor.* events, and
    // all channels linked to any affected monitor for incident.* / maintenance.* events.
    const channelIds = new Set<string>();
    if (monitorId) {
      const linked = await conn
        .select({ channelId: schema.monitorChannels.channelId })
        .from(schema.monitorChannels)
        .where(eq(schema.monitorChannels.monitorId, monitorId));
      for (const r of linked) channelIds.add(r.channelId);
    }
    if (incidentMonitorIds && incidentMonitorIds.length > 0) {
      const linked = await conn
        .select({ channelId: schema.monitorChannels.channelId })
        .from(schema.monitorChannels)
        .where(inArray(schema.monitorChannels.monitorId, incidentMonitorIds));
      for (const r of linked) channelIds.add(r.channelId);
    }

    if (channelIds.size === 0) {
      // No subscribers — mark sent so we don't retry.
      await conn
        .update(schema.events)
        .set({ status: "sent", processedAt: new Date() })
        .where(eq(schema.events.id, event.id));
      processed += 1;
      continue;
    }

    const channels = await conn
      .select()
      .from(schema.notificationChannels)
      .where(
        and(
          inArray(schema.notificationChannels.id, [...channelIds]),
          eq(schema.notificationChannels.enabled, true),
        ),
      );

    let allSucceeded = true;
    let lastError: string | null = null;
    let anyRetryable = false;

    for (const channel of channels) {
      if (channel.type !== "slack") continue;
      const message = renderSlackMessage(
        event.type as Parameters<typeof renderSlackMessage>[0],
        payload,
      );
      const res = await sendSlack(channel.config.webhookUrl, message);
      if (!res.ok) {
        allSucceeded = false;
        lastError = `slack ${res.status}: ${res.body.slice(0, 200)}`;
        if (res.retryable) anyRetryable = true;
      }
    }

    if (allSucceeded) {
      await conn
        .update(schema.events)
        .set({ status: "sent", processedAt: new Date(), lastError: null })
        .where(eq(schema.events.id, event.id));
      processed += 1;
      continue;
    }

    const giveUp = !anyRetryable || event.attempts >= MAX_ATTEMPTS;
    await conn
      .update(schema.events)
      .set({
        status: giveUp ? "failed" : "pending",
        lastError,
        nextAttemptAt: giveUp
          ? new Date()
          : new Date(Date.now() + backoffSeconds(event.attempts) * 1000),
        processedAt: giveUp ? new Date() : null,
      })
      .where(eq(schema.events.id, event.id));

    if (giveUp) failed += 1;
  }

  return { processed, failed };
}
