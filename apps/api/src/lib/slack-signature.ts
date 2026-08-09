import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Slack request signature per
 * https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * Returns true iff the timestamp is within the replay window AND the signature
 * matches HMAC-SHA256(`v0:${ts}:${rawBody}`, signingSecret).
 */
export function verifySlackSignature(args: {
  signingSecret: string;
  signature: string | undefined;
  timestamp: string | undefined;
  rawBody: string;
  /** Max age in seconds. Slack recommends 5 minutes. */
  toleranceSeconds?: number;
}): boolean {
  const { signingSecret, signature, timestamp, rawBody } = args;
  if (!signature || !timestamp) return false;

  const tolerance = args.toleranceSeconds ?? 300;
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Date.now() / 1000 - tsNum) > tolerance) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
