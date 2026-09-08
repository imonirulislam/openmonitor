import { describe, expect, test } from "bun:test";

// env.ts validates at import, so these must be set before the dynamic import.
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/db";
process.env.PROBE_API_KEY ??= "x".repeat(32);
process.env.PAGE_UNLOCK_SECRET ??= "y".repeat(32);
process.env.STATUS_PAGE_ROOT_DOMAIN = "openmonitor.app";

const { pageSlugFromHost } = await import("./resolve-page");

describe("pageSlugFromHost", () => {
  test("reads a page subdomain", () => {
    expect(pageSlugFromHost("acme.openmonitor.app")).toBe("acme");
    expect(pageSlugFromHost("ACME.OpenMonitor.App")).toBe("acme");
    expect(pageSlugFromHost("acme.openmonitor.app:3000")).toBe("acme");
  });

  // Regression: reading status.openmonitor.app as a page slug 404'd the real page.
  test.each(["status", "www", "dashboard", "app", "api", "mail", "admin", "clickhouse"])(
    "treats the reserved label %s as infrastructure, not a page",
    (label) => {
      expect(pageSlugFromHost(`${label}.openmonitor.app`)).toBeNull();
    },
  );

  test("ignores the apex and anything outside the root domain", () => {
    expect(pageSlugFromHost("openmonitor.app")).toBeNull();
    expect(pageSlugFromHost("acme.example.com")).toBeNull();
    expect(pageSlugFromHost("notopenmonitor.app")).toBeNull();
  });

  test("only the first label counts", () => {
    expect(pageSlugFromHost("a.b.openmonitor.app")).toBeNull();
  });

  test("undefined host", () => {
    expect(pageSlugFromHost(undefined)).toBeNull();
  });
});
