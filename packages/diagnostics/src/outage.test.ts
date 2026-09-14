import { describe, expect, it } from "bun:test";
import { classifyOutage, type OutageFacts, type RegionFacts } from "./outage";

function region(over: Partial<RegionFacts> & { region: string }): RegionFacts {
  return {
    total: 10,
    failed: 0,
    healthy: 10,
    lastStatus: "up",
    topError: "",
    topStatusCode: 0,
    ...over,
  };
}

const facts = (regions: RegionFacts[]): OutageFacts => ({ windowMinutes: 15, regions });

const down = (name: string, over: Partial<RegionFacts> = {}) =>
  region({ region: name, failed: 10, healthy: 0, lastStatus: "down", ...over });

describe("classifyOutage", () => {
  it("says nothing when no region is failing", () => {
    expect(classifyOutage(facts([region({ region: "fra" })]))).toBeNull();
  });

  it("says nothing when the window is empty", () => {
    expect(classifyOutage(facts([]))).toBeNull();
    expect(classifyOutage(facts([region({ region: "fra", total: 0 })]))).toBeNull();
  });

  it("calls it unreachable when every location fails", () => {
    const v = classifyOutage(facts([down("fra"), down("iad"), down("sin")]));
    expect(v?.spread).toContain("all 3 locations");
    expect(v?.spread).toContain("target itself");
  });

  // The discriminating case: a classifier that ignores healthy regions passes
  // every single-region test and gets this one wrong.
  it("calls out a partial failure and names both sides", () => {
    const v = classifyOutage(
      facts([down("sin"), region({ region: "fra" }), region({ region: "iad" })]),
    );
    expect(v?.spread).toContain("1 of 3 locations");
    expect(v?.spread).toContain("sin");
    expect(v?.spread).toContain("fra and iad");
    expect(v?.spread).toContain("regional");
    expect(v?.spread).not.toContain("target itself");
  });

  it("admits when there is nothing to cross-check against", () => {
    const v = classifyOutage(facts([down("local")]));
    expect(v?.spread).toContain("only location reporting");
  });

  it("reads DNS failure out of the transport error", () => {
    const v = classifyOutage(
      facts([
        down("fra", {
          topError:
            'Get "https://api.example.com/health": dial tcp: lookup api.example.com: no such host',
        }),
      ]),
    );
    expect(v?.cause).toContain("DNS");
    expect(v?.evidence).toContain("no HTTP response");
  });

  it("prefers the specific certificate signature over the generic one", () => {
    const v = classifyOutage(facts([down("fra", { topError: "x509: certificate has expired" })]));
    expect(v?.cause).toBe("The TLS certificate has expired.");
  });

  it("falls back to the status code when the error is unrecognised", () => {
    const v = classifyOutage(
      facts([down("fra", { topError: "something new", topStatusCode: 503 })]),
    );
    expect(v?.cause).toBe("The service is returning 503.");
    expect(v?.evidence).toContain("HTTP 503");
    expect(v?.evidence).toContain("something new");
  });

  it("leaves the cause unset rather than guessing", () => {
    const v = classifyOutage(facts([down("fra", { topError: "something new" })]));
    expect(v?.cause).toBeNull();
    expect(v?.spread).toBeTruthy();
  });

  it("takes the cause from the worst-hit region, not the first", () => {
    const v = classifyOutage(
      facts([
        down("fra", { failed: 1, topError: "connection reset" }),
        down("sin", { failed: 40, topError: "x509: certificate has expired" }),
      ]),
    );
    expect(v?.cause).toBe("The TLS certificate has expired.");
  });
});
