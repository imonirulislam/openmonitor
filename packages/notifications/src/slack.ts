import type { SlackMessage } from "./templates";

export type SlackSendResult =
  | { ok: true }
  | { ok: false; retryable: boolean; status: number; body: string };

export async function sendSlack(
  webhookUrl: string,
  message: SlackMessage,
  init: { signal?: AbortSignal } = {},
): Promise<SlackSendResult> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message),
    signal: init.signal,
  });

  if (res.ok) return { ok: true };

  const body = await res.text().catch(() => "");
  // Slack uses 5xx for transient and 429 for rate limit; 4xx (other) is config-broken.
  const retryable = res.status === 429 || res.status >= 500;
  return { ok: false, retryable, status: res.status, body };
}
