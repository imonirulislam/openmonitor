import { describe, expect, it } from "bun:test";
import { type DriftSample, findDrift } from "./drift";

const sample = (over: Partial<DriftSample> & { monitorId: string }): DriftSample => ({
  recentP95: 100,
  recentSamples: 500,
  earlierP95: 100,
  earlierSamples: 500,
  ...over,
});

describe("findDrift", () => {
  it("reports nothing when nothing moved", () => {
    expect(findDrift([sample({ monitorId: "a" })])).toEqual([]);
  });

  it("reports a real ramp with the percentage", () => {
    const [found] = findDrift([sample({ monitorId: "a", earlierP95: 180, recentP95: 340 })]);
    expect(found?.pct).toBe(89);
    expect(found?.earlierP95).toBe(180);
    expect(found?.recentP95).toBe(340);
  });

  it("ignores a big ratio on small numbers", () => {
    // 30ms → 45ms is +50% but only 15ms; not worth anyone's attention.
    expect(findDrift([sample({ monitorId: "a", earlierP95: 30, recentP95: 45 })])).toEqual([]);
  });

  it("ignores a big absolute jump that is proportionally small", () => {
    expect(findDrift([sample({ monitorId: "a", earlierP95: 1000, recentP95: 1200 })])).toEqual([]);
  });

  it("declines on thin data in either window", () => {
    const drifted = { earlierP95: 180, recentP95: 340 };
    expect(findDrift([sample({ monitorId: "a", ...drifted, recentSamples: 20 })])).toEqual([]);
    expect(findDrift([sample({ monitorId: "a", ...drifted, earlierSamples: 20 })])).toEqual([]);
  });

  it("ignores a monitor with no earlier baseline at all", () => {
    expect(findDrift([sample({ monitorId: "a", earlierP95: 0, recentP95: 340 })])).toEqual([]);
  });

  it("puts the worst regression first and caps the list", () => {
    const found = findDrift([
      sample({ monitorId: "a", earlierP95: 100, recentP95: 200 }), // +100%
      sample({ monitorId: "b", earlierP95: 100, recentP95: 400 }), // +300%
      sample({ monitorId: "c", earlierP95: 100, recentP95: 160 }), // +60%
      sample({ monitorId: "d", earlierP95: 100, recentP95: 300 }), // +200%
      sample({ monitorId: "e", earlierP95: 100, recentP95: 250 }), // +150%
      sample({ monitorId: "f", earlierP95: 100, recentP95: 180 }), // +80%
    ]);
    expect(found.map((f) => f.monitorId)).toEqual(["b", "d", "e", "a", "f"]);
    expect(found).toHaveLength(5);
  });
});
