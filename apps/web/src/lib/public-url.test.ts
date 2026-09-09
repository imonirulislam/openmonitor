import { expect, test } from "bun:test";

process.env.NEXT_PUBLIC_STATUS_PAGE_URL = "https://status.openmonitor.app";
const { publicPageUrl } = await import("./public-url");

test("subdomain form", () => {
  expect(publicPageUrl({ slug: "acme" })).toBe("https://acme.status.openmonitor.app");
});

test("custom domain wins", () => {
  expect(publicPageUrl({ slug: "acme", customDomain: "status.acme.com" })).toBe(
    "https://status.acme.com",
  );
});

test("null custom domain is ignored", () => {
  expect(publicPageUrl({ slug: "acme", customDomain: null })).toBe(
    "https://acme.status.openmonitor.app",
  );
});
