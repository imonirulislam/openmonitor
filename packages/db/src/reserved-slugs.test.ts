import { describe, expect, it } from "bun:test";
import { isReservedSlug, RESERVED_SLUGS } from "./reserved-slugs";

describe("isReservedSlug", () => {
  it("blocks the hostnames a tenant could phish or shadow with", () => {
    for (const slug of ["app", "api", "mail", "www", "admin", "login", "smtp"]) {
      expect(isReservedSlug(slug)).toBe(true);
    }
  });

  it("blocks status-page static routes, which would shadow a page slug", () => {
    for (const slug of ["events", "monitors", "unlock"]) {
      expect(isReservedSlug(slug)).toBe(true);
    }
  });

  it("is case-insensitive — hostnames are", () => {
    expect(isReservedSlug("API")).toBe(true);
    expect(isReservedSlug("Www")).toBe(true);
  });

  it("leaves ordinary tenant names alone", () => {
    for (const slug of ["acme", "tenant-b", "monirul-dev", "api-team", "my-app"]) {
      expect(isReservedSlug(slug)).toBe(false);
    }
  });

  it("exports a sorted list for error messages", () => {
    expect(RESERVED_SLUGS).toEqual([...RESERVED_SLUGS].sort());
    expect(RESERVED_SLUGS.length).toBeGreaterThan(30);
  });
});
