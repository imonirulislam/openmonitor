import { describe, expect, it } from "bun:test";
import { compareToBaseline } from "./baseline";

describe("compareToBaseline", () => {
  it("says nothing without enough history", () => {
    expect(compareToBaseline(400, { p95: 100, samples: 6 })).toBeNull();
    expect(compareToBaseline(400, { p95: 100, samples: 29 })).toBeNull();
  });

  it("says nothing when there is no band or no reading", () => {
    expect(compareToBaseline(400, { p95: 0, samples: 500 })).toBeNull();
    expect(compareToBaseline(null, { p95: 100, samples: 500 })).toBeNull();
    expect(compareToBaseline(0, { p95: 100, samples: 500 })).toBeNull();
  });

  // The pair that matters: identical observed latency, opposite verdicts.
  // A comparison that ignores the baseline gets exactly one of these right.
  it("reads the same latency differently against different baselines", () => {
    const slow = compareToBaseline(340, { p95: 105, samples: 400 });
    expect(slow?.unusual).toBe(true);
    expect(slow?.text).toContain("3.2×");
    expect(slow?.text).toContain("105ms");

    const normal = compareToBaseline(340, { p95: 320, samples: 400 });
    expect(normal?.unusual).toBe(false);
    expect(normal?.text).toContain("within its usual range");
    expect(normal?.text).toContain("320ms");
  });

  it("ignores a big ratio on tiny numbers", () => {
    const v = compareToBaseline(12, { p95: 4, samples: 400 });
    expect(v?.unusual).toBe(false);
  });

  it("needs both the ratio and the absolute jump", () => {
    // 1.9× and well over the floor — ratio guard holds.
    expect(compareToBaseline(950, { p95: 500, samples: 400 })?.unusual).toBe(false);
    // 2× and over the floor — flagged.
    expect(compareToBaseline(1000, { p95: 500, samples: 400 })?.unusual).toBe(true);
  });
});
