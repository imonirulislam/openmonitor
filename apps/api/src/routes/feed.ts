import { Hono } from "hono";
import { and, db, desc, eq, gte, schema, sql } from "@openmonitor/db";
import { resolveStatusPage } from "../lib/resolve-page";

export const feedRoutes = new Hono();

const RECENT_DAYS = 60;

/**
 * RSS 2.0 feed of incidents + maintenance for a single status page.
 *
 * URL forms:
 *   /v1/feed.xml                                  — uses ?host or default
 *   /v1/feed.xml?workspace=<slug>&page=<slug>     — explicit pair
 *   custom-domain.example.com/v1/feed.xml         — auto-resolved by host
 *
 * Items include both incidents (with the latest update message in <description>)
 * and maintenance windows. Sorted newest first.
 */
feedRoutes.get("/v1/feed.xml", async (c) => {
  const workspaceSlug = c.req.query("workspace");
  const pageSlug = c.req.query("page") ?? "default";
  const host = c.req.query("host") ?? c.req.header("host");
  const conn = db();

  const page = await resolveStatusPage(conn, workspaceSlug, pageSlug, host);
  if (!page || !page.isPublic) return c.text("not found", 404);

  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const ws = page.workspaceId;

  const incidents = await conn
    .select()
    .from(schema.incidents)
    .where(
      and(eq(schema.incidents.workspaceId, ws), gte(schema.incidents.startedAt, since)),
    )
    .orderBy(desc(schema.incidents.startedAt));

  const incidentIds = incidents.map((i) => i.id);
  const updates =
    incidentIds.length > 0
      ? await conn
          .select()
          .from(schema.incidentUpdates)
          .where(sql`${schema.incidentUpdates.incidentId} = ANY(${incidentIds})`)
          .orderBy(desc(schema.incidentUpdates.createdAt))
      : [];

  const latestUpdateByIncident = new Map<string, (typeof updates)[number]>();
  for (const u of updates) {
    if (!latestUpdateByIncident.has(u.incidentId)) {
      latestUpdateByIncident.set(u.incidentId, u);
    }
  }

  const maintenances = await conn
    .select()
    .from(schema.maintenances)
    .where(
      and(eq(schema.maintenances.workspaceId, ws), gte(schema.maintenances.startsAt, since)),
    )
    .orderBy(desc(schema.maintenances.startsAt));

  // Compose the feed link from the request URL — keeps the feed self-describing
  // without us having to know the public hostname at config time.
  const reqUrl = new URL(c.req.url);
  const siteBase = `${reqUrl.protocol}//${reqUrl.host}`;
  const feedUrl = `${siteBase}/v1/feed.xml`;

  type Item = {
    guid: string;
    title: string;
    description: string;
    pubDate: Date;
    category: string;
  };

  const items: Item[] = [];
  for (const i of incidents) {
    const last = latestUpdateByIncident.get(i.id);
    const desc = last ? last.message : `Status: ${i.status}, severity: ${i.severity}`;
    items.push({
      guid: `incident:${i.id}`,
      title: `[${i.severity.toUpperCase()}] ${i.title}`,
      description: desc,
      pubDate: last?.createdAt ?? i.startedAt,
      category: "incident",
    });
  }
  for (const m of maintenances) {
    items.push({
      guid: `maintenance:${m.id}`,
      title: `[Maintenance] ${m.title}`,
      description:
        (m.description ?? "Scheduled maintenance.") +
        ` (${m.startsAt.toISOString()} → ${m.endsAt.toISOString()})`,
      pubDate: m.startsAt,
      category: "maintenance",
    });
  }
  items.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(page.name)} — Status feed</title>
    <link>${esc(siteBase)}</link>
    <description>Recent incidents and maintenance windows.</description>
    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${esc(feedUrl)}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items
  .map(
    (it) => `    <item>
      <title>${esc(it.title)}</title>
      <description>${esc(it.description)}</description>
      <pubDate>${it.pubDate.toUTCString()}</pubDate>
      <guid isPermaLink="false">${esc(it.guid)}</guid>
      <category>${it.category}</category>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>`;

  c.header("content-type", "application/rss+xml; charset=utf-8");
  c.header("cache-control", "public, max-age=120, s-maxage=120");
  return c.body(xml);
});

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
