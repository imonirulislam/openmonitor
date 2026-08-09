import { and, asc, db, eq, ilike, schema, sql } from "@openmonitor/db";
import { type NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "~/lib/workspace";

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 25;

const statusPriority = sql`CASE ${schema.monitors.currentStatus}
  WHEN 'down' THEN 0
  WHEN 'degraded' THEN 1
  WHEN 'unknown' THEN 2
  ELSE 3
END`;

export async function GET(req: NextRequest) {
  const workspaceId = await getCurrentWorkspaceId();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const statusPageId = url.searchParams.get("statusPageId") || null;
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") | 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT)) | 0),
  );

  const conn = db();
  const conditions = [eq(schema.monitors.workspaceId, workspaceId)];
  if (q) conditions.push(ilike(schema.monitors.name, `%${q}%`));

  const select = {
    id: schema.monitors.id,
    name: schema.monitors.name,
    status: schema.monitors.currentStatus,
  };

  const rows = statusPageId
    ? await conn
        .select(select)
        .from(schema.monitors)
        .innerJoin(schema.pageComponents, eq(schema.pageComponents.monitorId, schema.monitors.id))
        .where(and(...conditions, eq(schema.pageComponents.statusPageId, statusPageId)))
        .orderBy(statusPriority, asc(schema.monitors.name))
        .limit(limit + 1)
        .offset(offset)
    : await conn
        .select(select)
        .from(schema.monitors)
        .where(and(...conditions))
        .orderBy(statusPriority, asc(schema.monitors.name))
        .limit(limit + 1)
        .offset(offset);

  const hasMore = rows.length > limit;
  const monitors = hasMore ? rows.slice(0, limit) : rows;
  return NextResponse.json({ monitors, hasMore });
}
