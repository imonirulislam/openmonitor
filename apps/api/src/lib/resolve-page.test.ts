import { describe, expect, test } from "bun:test";

// env.ts validates at import, so these must be set before the dynamic import.
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/db";
process.env.PROBE_API_KEY ??= "x".repeat(32);
process.env.PAGE_UNLOCK_SECRET ??= "y".repeat(32);
process.env.STATUS_PAGE_ROOT_DOMAIN = "openmonitor.app";

const { workspaceSlugFromHost } = await import("./resolve-page");

describe("workspaceSlugFromHost", () => {
  test("reads a tenant subdomain", () => {
    expect(workspaceSlugFromHost("acme.openmonitor.app")).toBe("acme");
    expect(workspaceSlugFromHost("ACME.OpenMonitor.App")).toBe("acme");
    expect(workspaceSlugFromHost("acme.openmonitor.app:3000")).toBe("acme");
  });

  // Regression: reading status.openmonitor.app as workspace "status" 404'd it.
  test.each(["status", "www", "dashboard", "app", "api", "mail", "admin", "clickhouse"])(
    "treats the reserved label %s as infrastructure, not a workspace",
    (label) => {
      expect(workspaceSlugFromHost(`${label}.openmonitor.app`)).toBeNull();
    },
  );

  test("ignores the apex and anything outside the root domain", () => {
    expect(workspaceSlugFromHost("openmonitor.app")).toBeNull();
    expect(workspaceSlugFromHost("acme.example.com")).toBeNull();
    expect(workspaceSlugFromHost("notopenmonitor.app")).toBeNull();
  });

  test("only the first label counts", () => {
    expect(workspaceSlugFromHost("a.b.openmonitor.app")).toBeNull();
  });

  test("undefined host", () => {
    expect(workspaceSlugFromHost(undefined)).toBeNull();
  });
});
