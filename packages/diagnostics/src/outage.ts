/**
 * Turns probe facts into a sentence an on-call reader can act on.
 *
 * Deterministic on purpose. Every claim here is derived from a column we can
 * show next to it — region counts, the HTTP status, the transport error the
 * checker recorded. A model may later rephrase this; it must not decide it.
 *
 * Phase timings are deliberately unused: `latency_*_ms` is `UInt32` and the
 * ingest coerces "phase not reached" to 0, so a failed handshake and a
 * sub-millisecond one are the same stored value. Attributing a cause to a
 * phase on that basis would be guessing.
 */

export type RegionFacts = {
  region: string;
  total: number;
  failed: number;
  healthy: number;
  lastStatus: "up" | "degraded" | "down" | "unknown";
  /** Most common non-empty error among failing runs. "" when none. */
  topError: string;
  /** Most common status code among failing runs. 0 means no response at all. */
  topStatusCode: number;
};

export type OutageFacts = {
  windowMinutes: number;
  regions: RegionFacts[];
};

export type OutageVerdict = {
  /** Where it's failing. Always present. */
  spread: string;
  /** Why, when the evidence supports a plain-language answer. */
  cause: string | null;
  /** The raw fields the sentences came from, for the reader to check. */
  evidence: string[];
};

/** Longest first, so "i/o timeout" doesn't win over a more specific match. */
const ERROR_SIGNATURES: { match: string; cause: string }[] = [
  { match: "no such host", cause: "DNS is not resolving the hostname." },
  { match: "server misbehaving", cause: "DNS is not resolving the hostname." },
  { match: "certificate has expired", cause: "The TLS certificate has expired." },
  { match: "certificate is valid for", cause: "The TLS certificate doesn't cover this hostname." },
  { match: "x509", cause: "The TLS certificate was rejected." },
  { match: "tls: ", cause: "The TLS handshake failed." },
  { match: "connection refused", cause: "The connection was refused — nothing is listening." },
  { match: "connection reset", cause: "The connection was reset mid-request." },
  { match: "no route to host", cause: "There is no network route to the host." },
  { match: "deadline exceeded", cause: "Requests are timing out." },
  { match: "timeout", cause: "Requests are timing out." },
];

function causeFromError(error: string): string | null {
  const haystack = error.toLowerCase();
  for (const { match, cause } of ERROR_SIGNATURES) {
    if (haystack.includes(match)) return cause;
  }
  return null;
}

function causeFromStatus(code: number): string | null {
  if (code >= 500) return `The service is returning ${code}.`;
  if (code >= 400) {
    return `The service is returning ${code} — check the monitor's expected status or its auth.`;
  }
  return null;
}

function list(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * `null` when the facts don't support saying anything — an empty window, or a
 * monitor with no failing region. Callers send the plain alert in that case
 * rather than padding it with a non-statement.
 */
export function classifyOutage(facts: OutageFacts): OutageVerdict | null {
  const reporting = facts.regions.filter((r) => r.total > 0);
  if (reporting.length === 0) return null;

  const failing = reporting.filter((r) => r.lastStatus === "down");
  if (failing.length === 0) return null;

  const healthy = reporting.filter((r) => r.lastStatus === "up");
  const failingNames = failing.map((r) => r.region);
  const healthyNames = healthy.map((r) => r.region);

  let spread: string;
  if (reporting.length === 1) {
    spread = `Failing from ${failingNames[0]}, the only location reporting — nothing to cross-check against.`;
  } else if (healthy.length === 0) {
    spread = `Failing from all ${reporting.length} locations — the target itself looks unreachable.`;
  } else {
    spread =
      `Failing from ${failing.length} of ${reporting.length} locations (${list(failingNames)}), ` +
      `while ${list(healthyNames)} ${healthy.length === 1 ? "is" : "are"} healthy — ` +
      `more likely regional than a full outage.`;
  }

  // The worst-affected region speaks for the cause: it has the most failures,
  // so its error is the least likely to be a one-off.
  const worst = [...failing].sort((a, b) => b.failed - a.failed)[0] as RegionFacts;
  const cause = causeFromError(worst.topError) ?? causeFromStatus(worst.topStatusCode);

  const evidence: string[] = [];
  if (worst.topStatusCode > 0) evidence.push(`HTTP ${worst.topStatusCode}`);
  else evidence.push("no HTTP response");
  if (worst.topError) evidence.push(worst.topError);
  evidence.push(
    `${failing.reduce((n, r) => n + r.failed, 0)} failed checks in the last ${facts.windowMinutes}m`,
  );

  return { spread, cause, evidence };
}
