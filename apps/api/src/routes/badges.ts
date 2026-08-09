import { and, db, eq, gte, schema, sql } from "@openmonitor/db";
import { type Context, Hono } from "hono";
import { resolveStatusPage } from "../lib/resolve-page";

export const badgeRoutes = new Hono();

/**
 * Public SVG badges — drop into READMEs or Confluence with
 *   <img src="https://status.example.com/v1/monitors/<slug>/badge.svg">
 *
 * `style=` switches between:
 *   - "uptime" (default): label "uptime" / value "99.92% (90d)"
 *   - "status":           label monitor name / value current status
 *
 * Resolution mirrors the rest of the public API: ?host wins (custom_domain),
 * then ?workspace=&page= explicit pair, then unambiguous slug-only fallback.
 */
badgeRoutes.get("/v1/monitors/:slug/badge.svg", async (c) => {
  const slug = c.req.param("slug");
  const style = c.req.query("style") === "status" ? "status" : "uptime";
  const workspaceSlug = c.req.query("workspace");
  const pageSlug = c.req.query("page") ?? "default";
  const host = c.req.query("host") ?? c.req.header("host");
  const conn = db();

  const page = await resolveStatusPage(conn, workspaceSlug, pageSlug, host);
  if (!page || !page.isPublic) {
    return svg(c, badgeSvg("monitor", "not found", "neutral"));
  }

  const [monitor] = await conn
    .select({
      id: schema.monitors.id,
      slug: schema.monitors.slug,
      name: schema.monitors.name,
      currentStatus: schema.monitors.currentStatus,
    })
    .from(schema.monitors)
    .innerJoin(schema.pageComponents, eq(schema.pageComponents.monitorId, schema.monitors.id))
    .where(
      and(
        eq(schema.monitors.slug, slug),
        eq(schema.monitors.workspaceId, page.workspaceId),
        eq(schema.pageComponents.statusPageId, page.id),
      ),
    )
    .limit(1);

  if (!monitor) return svg(c, badgeSvg("monitor", "not found", "neutral"));

  if (style === "status") {
    const tone = statusToTone(monitor.currentStatus);
    return svg(c, badgeSvg(monitor.name, statusLabel(monitor.currentStatus), tone));
  }

  // Uptime over last 90d.
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const [agg] = await conn
    .select({
      total: sql<number>`count(*)::int`,
      ok: sql<number>`sum(case when status = 'up' then 1 else 0 end)::int`,
    })
    .from(schema.monitorRuns)
    .where(
      and(eq(schema.monitorRuns.monitorId, monitor.id), gte(schema.monitorRuns.checkedAt, since)),
    );

  const total = agg?.total ?? 0;
  const ok = agg?.ok ?? 0;
  if (total === 0) return svg(c, badgeSvg("uptime", "no data", "neutral"));
  const uptime = (ok / total) * 100;
  const tone = uptime >= 99.5 ? "good" : uptime >= 95 ? "warn" : "bad";
  return svg(c, badgeSvg("uptime", `${uptime.toFixed(2)}% (90d)`, tone));
});

/** Aggregate page badge — shows worst monitor status across the page. */
badgeRoutes.get("/v1/status-pages/:pageSlug/badge.svg", async (c) => {
  const pageSlug = c.req.param("pageSlug");
  const workspaceSlug = c.req.query("workspace");
  const host = c.req.query("host") ?? c.req.header("host");
  const conn = db();

  const page = await resolveStatusPage(conn, workspaceSlug, pageSlug, host);
  if (!page || !page.isPublic) {
    return svg(c, badgeSvg("status", "not found", "neutral"));
  }

  const monitors = await conn
    .select({ status: schema.monitors.currentStatus })
    .from(schema.pageComponents)
    .innerJoin(schema.monitors, eq(schema.monitors.id, schema.pageComponents.monitorId))
    .where(and(eq(schema.pageComponents.statusPageId, page.id), eq(schema.monitors.enabled, true)));

  const overall = computeOverall(monitors.map((m) => m.status));
  return svg(c, badgeSvg("status", statusLabel(overall), statusToTone(overall)));
});

// -------- helpers --------

type Tone = "good" | "warn" | "bad" | "neutral";

const TONE_HEX: Record<Tone, string> = {
  good: "#22c55e", // green
  warn: "#f59e0b", // amber
  bad: "#ef4444", // red
  neutral: "#6b7280", // gray
};

function statusToTone(status: string): Tone {
  if (status === "up") return "good";
  if (status === "degraded") return "warn";
  if (status === "down") return "bad";
  return "neutral";
}

function statusLabel(status: string): string {
  if (status === "up") return "operational";
  if (status === "degraded") return "degraded";
  if (status === "down") return "down";
  return "unknown";
}

function computeOverall(statuses: string[]): string {
  if (statuses.length === 0) return "unknown";
  if (statuses.includes("down")) return "down";
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.every((s) => s === "up")) return "up";
  return "unknown";
}

/**
 * Renders a shields.io-style two-segment badge. We measure text width with a
 * cheap heuristic (~6.5px per char at 11px sans-serif) — close enough that the
 * badge looks balanced across short/long values without pulling in a font
 * metrics library.
 */
function badgeSvg(label: string, value: string, tone: Tone): string {
  const labelW = Math.ceil(label.length * 6.5) + 14;
  const valueW = Math.ceil(value.length * 6.5) + 14;
  const totalW = labelW + valueW;
  const valueColor = TONE_HEX[tone];
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="20" role="img" aria-label="${escape(label)}: ${escape(value)}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalW}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="20" fill="#555"/>
    <rect x="${labelW}" width="${valueW}" height="20" fill="${valueColor}"/>
    <rect width="${totalW}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelW / 2}" y="15" fill="#010101" fill-opacity=".3">${escape(label)}</text>
    <text x="${labelW / 2}" y="14">${escape(label)}</text>
    <text x="${labelW + valueW / 2}" y="15" fill="#010101" fill-opacity=".3">${escape(value)}</text>
    <text x="${labelW + valueW / 2}" y="14">${escape(value)}</text>
  </g>
</svg>`;
}

function svg(c: Context, body: string) {
  c.header("content-type", "image/svg+xml; charset=utf-8");
  // Public-cacheable for 60s. Badges don't need to be live-accurate; trading
  // freshness for protecting the DB if a popular README hits us hard.
  c.header("cache-control", "public, max-age=60, s-maxage=60");
  return c.body(body);
}
