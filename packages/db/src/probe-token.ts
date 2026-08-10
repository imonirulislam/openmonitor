import { createHash, randomBytes } from "node:crypto";

export const PROBE_TOKEN_PREFIX = "omp_";
const TOKEN_BYTES = 32;

/**
 * Mint a probe-location token. Returned in plaintext exactly once — only the
 * hash is persisted.
 *
 * 32 random bytes is 256 bits of entropy, which is what makes the unsalted
 * hash below safe.
 */
export function generateProbeToken(): string {
  return PROBE_TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Hash a probe token for storage and lookup.
 *
 * Deliberately **not** the salted scrypt used for user passwords. A salted KDF
 * produces a different digest every time, so the only way to find the matching
 * row would be to scan every probe location and verify each one — O(n) calls to
 * a deliberately slow function on every probe ingest.
 *
 * Salting and key stretching exist to make offline brute force expensive against
 * low-entropy, human-chosen passwords. These tokens are 256 bits of CSPRNG
 * output, so there is nothing to guess and no dictionary to precompute; a plain
 * SHA-256 is both safe here and directly indexable.
 */
export function hashProbeToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
