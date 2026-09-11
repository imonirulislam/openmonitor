export type AffectedMonitor = { slug: string; name: string };

export type IncidentUpdateEntry = {
  status: "investigating" | "identified" | "monitoring" | "resolved";
  message: string;
  createdAt: string;
};

export type StatusIncident = {
  id: string;
  title: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  severity: "minor" | "major" | "critical";
  startedAt: string;
  resolvedAt: string | null;
  affected: AffectedMonitor[];
  updates: IncidentUpdateEntry[];
  latestUpdate: string | null;
};

export type StatusMaintenance = {
  id: string;
  title: string;
  description: string | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  startsAt: string;
  endsAt: string;
  affected: AffectedMonitor[];
};

export type StatusPageBranding = {
  name: string;
  logoUrl: string | null;
  iconUrl: string | null;
  primaryColor: string | null;
  customCss: string | null;
  homepageUrl: string | null;
  contactUrl: string | null;
  /** Whether the footer carries "Monitored by OpenMonitor". */
  showAttribution: boolean;
};

export type StatusComponent = {
  /** page_components.id (NOT monitor.id) — stable across name overrides. */
  id: string;
  type: "monitor" | "static";
  /** Linked monitor's slug, used for per-monitor history calls. null when type='static'. */
  monitorSlug: string | null;
  /** Display name override (admins can rename a monitor for the public view). */
  name: string;
  description: string | null;
  status: "up" | "down" | "degraded" | "unknown";
  lastCheckedAt: string | null;
  /** id of the parent group, or null for ungrouped. Group metadata is in `componentGroups`. */
  groupId: string | null;
};

export type StatusComponentGroup = {
  id: string;
  name: string;
  defaultOpen: boolean;
};

/** A dependency shown on the metrics tab only — never counted as page status. */
export type MetricMonitor = {
  id: string;
  monitorSlug: string;
  name: string;
  description: string | null;
};

export type LatencyPercentiles = {
  monitor: { id: string; slug: string; name: string };
  buckets: { bucket: string; p50: number; p90: number; p99: number }[];
};

export type StatusSummary = {
  page: StatusPageBranding;
  components: StatusComponent[];
  /** Monitors on the metrics tab. Empty unless a component opts in. */
  metricMonitors: MetricMonitor[];
  componentGroups: StatusComponentGroup[];
  incidents: StatusIncident[];
  maintenances: StatusMaintenance[];
  pastIncidents: StatusIncident[];
  pastMaintenances: StatusMaintenance[];
};

export type MonitorHistoryDayEvent = {
  type: "incident" | "maintenance";
  id: string;
  title: string;
  status: string;
  severity?: "minor" | "major" | "critical";
  autoCreated?: boolean;
  /** ISO timestamp marking the event's start. */
  from: string;
  /** ISO timestamp marking the event's end. Null for ongoing events. */
  to: string | null;
};

export type MonitorHistoryDay = {
  date: string;
  total: number;
  ok: number;
  /** Probes that came back as `degraded` (assertion-pass + latency over threshold). */
  degraded: number;
  /** Probes that came back as `down` (assertion failure or transport error). */
  down: number;
  /** Probes that came back as `unknown` (rare; not yet evaluated). */
  unknown: number;
  /** Convenience: `degraded + down`. Kept for older renderers. */
  failed: number;
  /** Day-level rollup from the per-status counts. */
  status: "up" | "down" | "degraded" | "unknown" | "no_data";
  /** Incidents and maintenances overlapping this day (linked to this monitor). */
  events: MonitorHistoryDayEvent[];
};

export type MonitorHistory = {
  monitor: { id: string; slug: string; name: string };
  days: MonitorHistoryDay[];
  /** IANA TZ name the day buckets were computed in. */
  tz: string;
};

export type MonitorLatencyBucket = {
  /** ISO timestamp at the start of a ~10-minute bucket. */
  bucket: string;
  /** Average latency over the bucket, in milliseconds. */
  avg: number;
  /** p95 latency over the bucket, in milliseconds. */
  p95: number;
  ok: number;
  total: number;
};

export type MonitorLatency = {
  monitor: { id: string; slug: string; name: string };
  hours: number;
  buckets: MonitorLatencyBucket[];
};

export type ApiClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
};

export class ApiClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private fetchFn: typeof fetch;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.headers = opts.headers ?? {};
    // Bind fetch to its owning global so calling it via `this.fetchFn(...)`
    // doesn't trigger "Illegal invocation" — browser's fetch requires
    // `this === window`, and storing it as an instance property otherwise
    // rebinds `this` to the ApiClient.
    const f = opts.fetch ?? globalThis.fetch;
    this.fetchFn = f.bind(globalThis);
  }

  async getStatus(
    options: { workspace?: string; page?: string; host?: string; unlock?: string } = {},
  ): Promise<StatusSummary> {
    const params = new URLSearchParams();
    if (options.workspace) params.set("workspace", options.workspace);
    if (options.page) params.set("page", options.page);
    if (options.host) params.set("host", options.host);
    if (options.unlock) params.set("unlock", options.unlock);
    const qs = params.toString();
    return this.get<StatusSummary>(`/v1/status${qs ? `?${qs}` : ""}`);
  }

  /** Histories for several monitors in one request; keyed by the caller's slug order. */
  /** Latency percentiles for the metrics tab, one request for the whole page. */
  async getMonitorPercentiles(
    slugs: string[],
    options: {
      hours?: number;
      workspace?: string;
      page?: string;
      host?: string;
      unlock?: string;
    } = {},
  ): Promise<LatencyPercentiles[]> {
    if (slugs.length === 0) return [];
    const params = new URLSearchParams({
      slugs: slugs.join(","),
      hours: String(options.hours ?? 24),
    });
    if (options.workspace) params.set("workspace", options.workspace);
    if (options.page) params.set("page", options.page);
    if (options.host) params.set("host", options.host);
    if (options.unlock) params.set("unlock", options.unlock);
    const res = await this.get<{ monitors: LatencyPercentiles[] }>(
      `/v1/monitors/latency?${params.toString()}`,
    );
    return res.monitors;
  }

  async getMonitorHistories(
    slugs: string[],
    options: {
      days?: number;
      tz?: string;
      workspace?: string;
      page?: string;
      host?: string;
      unlock?: string;
    } = {},
  ): Promise<MonitorHistory[]> {
    if (slugs.length === 0) return [];
    const params = new URLSearchParams({
      slugs: slugs.join(","),
      days: String(options.days ?? 90),
    });
    if (options.tz) params.set("tz", options.tz);
    if (options.workspace) params.set("workspace", options.workspace);
    if (options.page) params.set("page", options.page);
    if (options.host) params.set("host", options.host);
    if (options.unlock) params.set("unlock", options.unlock);
    const res = await this.get<{ monitors: MonitorHistory[] }>(
      `/v1/monitors/history?${params.toString()}`,
    );
    return res.monitors;
  }

  async getMonitorHistory(
    slug: string,
    options: {
      days?: number;
      tz?: string;
      workspace?: string;
      page?: string;
      host?: string;
      unlock?: string;
    } = {},
  ): Promise<MonitorHistory> {
    const days = options.days ?? 90;
    const params = new URLSearchParams({ days: String(days) });
    if (options.tz) params.set("tz", options.tz);
    if (options.workspace) params.set("workspace", options.workspace);
    if (options.page) params.set("page", options.page);
    if (options.host) params.set("host", options.host);
    if (options.unlock) params.set("unlock", options.unlock);
    return this.get<MonitorHistory>(
      `/v1/monitors/${encodeURIComponent(slug)}/history?${params.toString()}`,
    );
  }

  async getMonitorLatency(
    slug: string,
    options: {
      hours?: number;
      workspace?: string;
      page?: string;
      host?: string;
      unlock?: string;
    } = {},
  ): Promise<MonitorLatency> {
    const params = new URLSearchParams({ hours: String(options.hours ?? 24) });
    if (options.workspace) params.set("workspace", options.workspace);
    if (options.page) params.set("page", options.page);
    if (options.host) params.set("host", options.host);
    if (options.unlock) params.set("unlock", options.unlock);
    return this.get<MonitorLatency>(
      `/v1/monitors/${encodeURIComponent(slug)}/latency?${params.toString()}`,
    );
  }

  /**
   * Submit a password to unlock a status page. Returns the signed token to
   * store as a cookie, or `null` on bad password. Status-page server actions
   * call this; visitors don't hit the API directly.
   */
  async unlockPage(options: {
    workspace?: string;
    page?: string;
    host?: string;
    password: string;
  }): Promise<{ token: string } | null> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/pages/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.headers },
      body: JSON.stringify(options),
      cache: "no-store",
    });
    if (res.status === 401) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`api ${res.status}: ${body || res.statusText}`);
    }
    const json = (await res.json()) as { token: string };
    return { token: json.token };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      headers: { accept: "application/json", ...this.headers },
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 401 with `requiresPassword: true` is the unlock-required signal —
      // surface as a typed error so the page can redirect to /unlock.
      if (res.status === 401) {
        try {
          const parsed = JSON.parse(body) as { requiresPassword?: boolean };
          if (parsed.requiresPassword) throw new RequiresPasswordError();
        } catch (e) {
          if (e instanceof RequiresPasswordError) throw e;
          // JSON parse failed — fall through to generic error below.
        }
      }
      // 404 surfaces as a typed error so the page can render Next's
      // not-found chrome instead of a 500.
      if (res.status === 404) throw new NotFoundError();
      throw new Error(`api ${res.status}: ${body || res.statusText}`);
    }
    return (await res.json()) as T;
  }
}

/**
 * Thrown when the API returns 401 with `requiresPassword: true`. Callers
 * (the status-page server) should catch this and redirect to /unlock.
 */
export class RequiresPasswordError extends Error {
  constructor() {
    super("status page requires password");
    this.name = "RequiresPasswordError";
  }
}

/**
 * Thrown when the API returns 404. Callers (the status-page server) should
 * catch this and call Next's `notFound()` to render the proper 404 chrome
 * instead of letting a generic Error surface as a 500.
 */
export class NotFoundError extends Error {
  constructor() {
    super("not found");
    this.name = "NotFoundError";
  }
}
