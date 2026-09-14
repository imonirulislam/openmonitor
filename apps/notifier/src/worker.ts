import { latencyBaseline, outageFacts } from "@openmonitor/clickhouse";
import { and, db, desc, eq, gte, inArray, lte, rows, schema, sql } from "@openmonitor/db";
import { classifyOutage, compareToBaseline, describeRecentChanges } from "@openmonitor/diagnostics";
import { renderSlackMessage, sendSlack } from "@openmonitor/notifications";

const MAX_ATTEMPTS = 6;
const BATCH_SIZE = 25;

/**
 * Answers "is this actually unusual?" on a degraded alert. The threshold that
 * fired it is a fixed number that knows nothing about time of day, so the
 * band's most useful answer is often that nothing is wrong.
 */
async function withBaseline(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const monitorId = (payload.monitor as { id?: string } | undefined)?.id;
  const region = typeof payload.region === "string" ? payload.region : null;
  const latencyMs = typeof payload.latencyMs === "number" ? payload.latencyMs : null;
  const checkedAt = typeof payload.checkedAt === "string" ? payload.checkedAt : null;
  if (!monitorId || !region || latencyMs === null || !checkedAt) return payload;

  try {
    const at = new Date(checkedAt);
    if (Number.isNaN(at.getTime())) return payload;
    const verdict = compareToBaseline(latencyMs, await latencyBaseline(monitorId, region, at));
    return verdict ? { ...payload, baseline: verdict } : payload;
  } catch (err) {
    console.error("baseline lookup failed:", err);
    return payload;
  }
}

/** Config edits to this monitor in the hour before an alert, newest first. */
async function recentMonitorChanges(monitorId: string, workspaceId: string, before: Date) {
  const since = new Date(before.getTime() - 60 * 60 * 1000);
  return db()
    .select({
      action: schema.auditLogs.action,
      actorEmail: schema.auditLogs.actorEmail,
      createdAt: schema.auditLogs.createdAt,
    })
    .from(schema.auditLogs)
    .where(
      and(
        eq(schema.auditLogs.workspaceId, workspaceId),
        eq(schema.auditLogs.targetType, "monitor"),
        eq(schema.auditLogs.targetId, monitorId),
        gte(schema.auditLogs.createdAt, since),
        lte(schema.auditLogs.createdAt, before),
      ),
    )
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(10);
}

/**
 * Annotates a `monitor.down` payload with where it's failing and whether we
 * changed anything first. Every other event type passes through untouched.
 *
 * Both annotations are best-effort and independent: a failing audit query must
 * not cost the triage line, and neither may cost the alert.
 */
async function withTriage(
  type: string,
  payload: Record<string, unknown>,
  workspaceId: string,
): Promise<Record<string, unknown>> {
  if (type === "monitor.degraded") return withBaseline(payload);
  if (type !== "monitor.down") return payload;
  const monitorId = (payload.monitor as { id?: string } | undefined)?.id;
  if (!monitorId) return payload;

  let verdict: ReturnType<typeof classifyOutage> = null;
  try {
    verdict = classifyOutage(await outageFacts(monitorId));
  } catch (err) {
    console.error("triage failed:", err);
  }

  let changed: string | null = null;
  const checkedAt = typeof payload.checkedAt === "string" ? payload.checkedAt : null;
  if (checkedAt) {
    try {
      const rowsOut = await recentMonitorChanges(monitorId, workspaceId, new Date(checkedAt));
      changed = describeRecentChanges(
        rowsOut.map((r) => ({
          action: r.action,
          actorEmail: r.actorEmail,
          at: r.createdAt.toISOString(),
        })),
        checkedAt,
      );
    } catch (err) {
      console.error("recent-changes lookup failed:", err);
    }
  }

  if (!verdict && !changed) return payload;
  // The change line is evidence, not a second verdict — it rides in the same
  // context row rather than adding another block to the message.
  return {
    ...payload,
    triage: {
      spread: verdict?.spread ?? "",
      cause: verdict?.cause ?? null,
      evidence: [...(verdict?.evidence ?? []), ...(changed ? [changed] : [])],
    },
  };
}

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
    // snake_case: this is `returning *` from raw SQL, not a Drizzle projection.
    workspace_id: string;
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

    // A down alert carries what the other regions saw. Best-effort: probe
    // history lives in ClickHouse, and an alert that doesn't send because
    // ClickHouse is slow is worse than one without a triage line.
    const enriched = await withTriage(event.type, payload, event.workspace_id);

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
        enriched,
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
