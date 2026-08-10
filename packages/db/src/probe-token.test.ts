import { describe, expect, test } from "bun:test";
import { generateProbeToken, hashProbeToken, PROBE_TOKEN_PREFIX } from "./probe-token";

describe("generateProbeToken", () => {
  test("carries the identifying prefix", () => {
    expect(generateProbeToken().startsWith(PROBE_TOKEN_PREFIX)).toBe(true);
  });

  test("is unique across many mints", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateProbeToken()));
    expect(seen.size).toBe(500);
  });

  test("carries enough entropy that guessing is not a threat", () => {
    // 32 bytes → 43 base64url chars. This is the premise the unsalted hash rests
    // on; if the token ever shrinks, revisit hashProbeToken.
    const secret = generateProbeToken().slice(PROBE_TOKEN_PREFIX.length);
    expect(secret.length).toBeGreaterThanOrEqual(43);
  });
});

describe("hashProbeToken", () => {
  test("is deterministic — this is what makes indexed lookup possible", () => {
    const token = generateProbeToken();
    expect(hashProbeToken(token)).toBe(hashProbeToken(token));
  });

  test("different tokens hash differently", () => {
    expect(hashProbeToken(generateProbeToken())).not.toBe(hashProbeToken(generateProbeToken()));
  });

  test("produces a 64-char hex digest that fits token_hash varchar(255)", () => {
    const hash = hashProbeToken(generateProbeToken());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("does not leak the token itself", () => {
    const token = generateProbeToken();
    expect(hashProbeToken(token)).not.toContain(token);
  });
});
