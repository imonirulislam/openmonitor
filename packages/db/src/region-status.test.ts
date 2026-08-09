import { describe, expect, test } from "bun:test";
import { type RegionPolicy, type RegionStatusRow, reduceRegionStatuses } from "./region-status";
import type { MonitorStatus } from "./types";

const rows = (...statuses: MonitorStatus[]): RegionStatusRow[] =>
  statuses.map((status, i) => ({ region: `r${i}`, status }));

const POLICIES: RegionPolicy[] = ["any", "majority", "all"];

describe("single region — the parity guarantee", () => {
  // This is the property that makes the reduction a no-op for existing installs:
  // with one reporting region, the global status is that region's status under
  // every policy. If any of these break, single-region behavior has changed.
  for (const policy of POLICIES) {
    for (const status of ["up", "down", "degraded"] as MonitorStatus[]) {
      test(`${policy}: one region reporting ${status} → ${status}`, () => {
        expect(reduceRegionStatuses(rows(status), policy)).toBe(status);
      });
    }
  }
});

describe("no reporting regions", () => {
  for (const policy of POLICIES) {
    test(`${policy}: empty → unknown`, () => {
      expect(reduceRegionStatuses([], policy)).toBe("unknown");
    });
    test(`${policy}: all unknown → unknown`, () => {
      expect(reduceRegionStatuses(rows("unknown", "unknown"), policy)).toBe("unknown");
    });
  }
});

describe("unknown regions are excluded from the denominator", () => {
  test("any: one down alongside two unknown → down", () => {
    expect(reduceRegionStatuses(rows("down", "unknown", "unknown"), "any")).toBe("down");
  });

  test("majority: 1 down of 1 reporting → down, even with unknowns present", () => {
    // Counting unknowns would make this 1 of 3 and yield `up`.
    expect(reduceRegionStatuses(rows("down", "unknown", "unknown"), "majority")).toBe("down");
  });

  test("all: every *reporting* region down → down, despite unknowns", () => {
    expect(reduceRegionStatuses(rows("down", "unknown"), "all")).toBe("down");
  });

  test("adding an unprobed region does not change a healthy monitor", () => {
    const before = reduceRegionStatuses(rows("up", "up"), "majority");
    const after = reduceRegionStatuses(rows("up", "up", "unknown"), "majority");
    expect(after).toBe(before);
    expect(after).toBe("up");
  });
});

describe("policy: any", () => {
  test("one down out of three → down", () => {
    expect(reduceRegionStatuses(rows("up", "up", "down"), "any")).toBe("down");
  });
  test("one degraded, none down → degraded", () => {
    expect(reduceRegionStatuses(rows("up", "degraded", "up"), "any")).toBe("degraded");
  });
  test("down outranks degraded", () => {
    expect(reduceRegionStatuses(rows("degraded", "down"), "any")).toBe("down");
  });
  test("all up → up", () => {
    expect(reduceRegionStatuses(rows("up", "up", "up"), "any")).toBe("up");
  });
});

describe("policy: majority", () => {
  test("2 of 3 down → down", () => {
    expect(reduceRegionStatuses(rows("down", "down", "up"), "majority")).toBe("down");
  });
  test("1 of 3 down → up (a single flaky probe does not page)", () => {
    expect(reduceRegionStatuses(rows("down", "up", "up"), "majority")).toBe("up");
  });
  test("exactly half down is not a majority", () => {
    expect(reduceRegionStatuses(rows("down", "up"), "majority")).toBe("up");
  });
  test("half down + half degraded → degraded (unhealthy majority, not down majority)", () => {
    expect(reduceRegionStatuses(rows("down", "degraded"), "majority")).toBe("degraded");
  });
  test("2 of 3 degraded → degraded", () => {
    expect(reduceRegionStatuses(rows("degraded", "degraded", "up"), "majority")).toBe("degraded");
  });
});

describe("policy: all", () => {
  test("every region down → down", () => {
    expect(reduceRegionStatuses(rows("down", "down"), "all")).toBe("down");
  });
  test("one region still up → up", () => {
    expect(reduceRegionStatuses(rows("down", "down", "up"), "all")).toBe("up");
  });
  test("mix of down and degraded, none up → degraded", () => {
    expect(reduceRegionStatuses(rows("down", "degraded"), "all")).toBe("degraded");
  });
});

describe("ordering does not matter", () => {
  test("same multiset reduces the same regardless of order", () => {
    for (const policy of POLICIES) {
      const a = reduceRegionStatuses(rows("up", "down", "degraded"), policy);
      const b = reduceRegionStatuses(rows("degraded", "up", "down"), policy);
      expect(b).toBe(a);
    }
  });
});
