/**
 * "Did we do this to ourselves?" — the second question after an alert.
 *
 * Correlation only. The claim is deliberately weak: a change happened before
 * the alert, not that it caused it. Anything at or after the alert timestamp is
 * dropped, because edits made in response to an outage would otherwise read as
 * the reason for it.
 */

export type ChangeRecord = {
  action: string;
  actorEmail: string | null;
  /** ISO timestamp. */
  at: string;
};

/**
 * Changing which Slack channel receives an alert cannot alter a probe result,
 * so it's noise here. Nothing else is excluded — an action name is a poor
 * guide to what a change actually did, and hiding a real cause is worse than
 * showing an irrelevant one.
 */
const IRRELEVANT = new Set(["monitor.updated.channels"]);

const PHRASES: Record<string, string> = {
  "monitor.created": "monitor created",
  "monitor.updated.config": "configuration changed",
  "monitor.updated.schedule": "schedule changed",
  "monitor.updated.response_time": "response-time threshold changed",
};

function phrase(action: string): string {
  return PHRASES[action] ?? action;
}

function minutesBetween(earlier: string, later: string): number | null {
  const a = Date.parse(earlier);
  const b = Date.parse(later);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

/**
 * `null` when nothing relevant preceded the alert — the caller adds no line
 * rather than reporting an absence.
 */
export function describeRecentChanges(changes: ChangeRecord[], alertAt: string): string | null {
  const alertMs = Date.parse(alertAt);
  if (Number.isNaN(alertMs)) return null;

  const relevant = changes
    .filter((c) => !IRRELEVANT.has(c.action))
    .filter((c) => {
      const at = Date.parse(c.at);
      return !Number.isNaN(at) && at <= alertMs;
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const latest = relevant[0];
  if (!latest) return null;

  const mins = minutesBetween(latest.at, alertAt);
  const when = mins === null ? "shortly" : mins === 0 ? "less than a minute" : `${mins}m`;
  const who = latest.actorEmail ? ` by ${latest.actorEmail}` : "";
  const more =
    relevant.length > 1
      ? ` (+${relevant.length - 1} more change${relevant.length > 2 ? "s" : ""})`
      : "";

  return `${phrase(latest.action)}${who} ${when} before this alert${more}`;
}
