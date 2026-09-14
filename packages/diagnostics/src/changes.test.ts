import { describe, expect, it } from "bun:test";
import { type ChangeRecord, describeRecentChanges } from "./changes";

const ALERT = "2026-09-14T12:00:00.000Z";
const minsBefore = (n: number) => new Date(Date.parse(ALERT) - n * 60000).toISOString();
const minsAfter = (n: number) => new Date(Date.parse(ALERT) + n * 60000).toISOString();

const change = (over: Partial<ChangeRecord> = {}): ChangeRecord => ({
  action: "monitor.updated.config",
  actorEmail: "admin@openmonitor.local",
  at: minsBefore(8),
  ...over,
});

describe("describeRecentChanges", () => {
  it("says nothing when there are no changes", () => {
    expect(describeRecentChanges([], ALERT)).toBeNull();
  });

  it("names the change, who made it, and how long before", () => {
    const line = describeRecentChanges([change()], ALERT);
    expect(line).toBe("configuration changed by admin@openmonitor.local 8m before this alert");
  });

  // The discriminating case: an edit made in response to the outage must not
  // be reported as preceding it.
  it("ignores changes made after the alert", () => {
    expect(describeRecentChanges([change({ at: minsAfter(3) })], ALERT)).toBeNull();

    const line = describeRecentChanges(
      [
        change({ at: minsAfter(3), action: "monitor.updated.schedule" }),
        change({ at: minsBefore(20) }),
      ],
      ALERT,
    );
    expect(line).toContain("configuration changed");
    expect(line).toContain("20m");
    expect(line).not.toContain("schedule");
    expect(line).not.toContain("more change");
  });

  it("reports the most recent qualifying change and counts the rest", () => {
    const line = describeRecentChanges(
      [
        change({ at: minsBefore(40), action: "monitor.created" }),
        change({ at: minsBefore(5), action: "monitor.updated.schedule" }),
        change({ at: minsBefore(22) }),
      ],
      ALERT,
    );
    expect(line).toContain("schedule changed");
    expect(line).toContain("5m before");
    expect(line).toContain("(+2 more changes)");
  });

  it("drops channel edits, which cannot affect a probe", () => {
    expect(
      describeRecentChanges([change({ action: "monitor.updated.channels" })], ALERT),
    ).toBeNull();
  });

  it("keeps an unknown action rather than hiding it", () => {
    const line = describeRecentChanges([change({ action: "monitor.something.new" })], ALERT);
    expect(line).toContain("monitor.something.new");
  });

  it("handles a missing actor and a sub-minute gap", () => {
    const line = describeRecentChanges([change({ actorEmail: null, at: minsBefore(0) })], ALERT);
    expect(line).toBe("configuration changed less than a minute before this alert");
  });

  it("returns null on an unparseable alert timestamp", () => {
    expect(describeRecentChanges([change()], "not-a-date")).toBeNull();
  });
});
