import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const source = readFileSync(join(here, "runs.ts"), "utf8");

/**
 * quantile/avg return NaN over an empty set and ClickHouse rejects
 * toUInt32(NaN) — code 70. That took the monitors page down on a fresh
 * deployment. Checked against the source so it needs no server.
 */
test("every rounded aggregate is guarded against NaN", () => {
  const unguarded: string[] = [];
  for (const line of source.split("\n")) {
    if (!line.includes("round(")) continue;
    if (!/\b(avg|quantile)/.test(line)) continue;
    if (!line.includes("ifNotFinite")) unguarded.push(line.trim());
  }
  expect(unguarded).toEqual([]);
});

test("the guard is actually applied somewhere", () => {
  // Guards against the check above passing vacuously if the queries move.
  expect(source.match(/ifNotFinite/g)?.length ?? 0).toBeGreaterThan(10);
});
