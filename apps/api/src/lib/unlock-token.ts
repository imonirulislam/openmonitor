import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

const TTL_MS = 24 * 60 * 60 * 1000; // 24h. Visitor re-auths once per day.

/**
 * Mint an HMAC-signed unlock token for a specific status page. The token is
 * `<pageId>.<expiresAt>.<sig>` so the API can verify expiry without keeping
 * server-side state. `pageId` and `expiresAt` go through HMAC together so the
 * signature can't be reused across pages or extended.
 */
export function mintUnlockToken(pageId: string): string {
  const expiresAt = Date.now() + TTL_MS;
  const sig = sign(`${pageId}.${expiresAt}`);
  return `${pageId}.${expiresAt}.${sig}`;
}

/** Returns true iff token is well-formed, unexpired, and bound to pageId. */
export function verifyUnlockToken(token: string, pageId: string): boolean {
  const [tokenPageId, expStr, sig] = token.split(".");
  if (!tokenPageId || !expStr || !sig) return false;
  if (tokenPageId !== pageId) return false;
  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expected = sign(`${tokenPageId}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sign(payload: string): string {
  return createHmac("sha256", env.PAGE_UNLOCK_SECRET).update(payload).digest("hex");
}
