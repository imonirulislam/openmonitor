import { and, db, eq, schema } from "@openmonitor/db";
import { notFound } from "next/navigation";

/**
 * Turn a URL parameter into the row's uuid.
 *
 * Dashboard URLs address things the way people talk about them — a monitor by
 * its slug, an incident by its number — rather than by a uuid nobody can read
 * back over a call. Everything downstream still works in uuids, so each route
 * resolves once at the top and passes the id on.
 *
 * Old uuid links keep working. A slug can be renamed and an incident's number
 * never changes, but bookmarks and links in Slack messages outlive both, so the
 * uuid form stays a permanent alias rather than a migration window.
 *
 * The uuid check has to come first and has to be a shape test: passing a
 * non-uuid string to a uuid column makes Postgres raise `invalid input syntax`
 * rather than returning no rows, so `or(eq(id), eq(slug))` would throw.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

async function bySlug(
  table: typeof schema.monitors | typeof schema.statusPages | typeof schema.heartbeatMonitors,
  param: string,
  workspaceId: string,
): Promise<string> {
  const [row] = await db()
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        isUuid(param) ? eq(table.id, param) : eq(table.slug, param),
        eq(table.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!row) notFound();
  return row.id;
}

/** `/monitors/<slug|uuid>` */
export function monitorIdFrom(param: string, workspaceId: string): Promise<string> {
  return bySlug(schema.monitors, param, workspaceId);
}

/** `/status-pages/<slug|uuid>` */
export function statusPageIdFrom(param: string, workspaceId: string): Promise<string> {
  return bySlug(schema.statusPages, param, workspaceId);
}

/** `/heartbeats/<slug|uuid>` */
export function heartbeatIdFrom(param: string, workspaceId: string): Promise<string> {
  return bySlug(schema.heartbeatMonitors, param, workspaceId);
}

/**
 * `/incidents/<number|uuid>`
 *
 * Incidents have no slug — a title changes as an outage is understood, which is
 * exactly what you don't want in a URL — so they're numbered per workspace.
 */
export async function incidentIdFrom(param: string, workspaceId: string): Promise<string> {
  const number = Number(param);
  const match = isUuid(param)
    ? eq(schema.incidents.id, param)
    : Number.isInteger(number) && number > 0
      ? eq(schema.incidents.number, number)
      : null;
  if (!match) notFound();

  const [row] = await db()
    .select({ id: schema.incidents.id })
    .from(schema.incidents)
    .where(and(match, eq(schema.incidents.workspaceId, workspaceId)))
    .limit(1);
  if (!row) notFound();
  return row.id;
}

/**
 * The reverse: uuid to the value that addresses it in a URL.
 *
 * Server actions receive the uuid (that's what their writes need) but have to
 * redirect and revalidate against the address the browser is actually on. A
 * `revalidatePath` aimed at the uuid form wouldn't invalidate the slug page the
 * user is looking at, so this is correctness, not just cosmetics.
 */
async function slugOf(
  table: typeof schema.monitors | typeof schema.statusPages | typeof schema.heartbeatMonitors,
  id: string,
): Promise<string> {
  const [row] = await db()
    .select({ slug: table.slug })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  // Falling back to the uuid keeps a redirect working if the row was deleted by
  // the very action doing the redirecting.
  return row?.slug ?? id;
}

export const monitorSlug = (id: string) => slugOf(schema.monitors, id);
export const statusPageSlug = (id: string) => slugOf(schema.statusPages, id);
export const heartbeatSlug = (id: string) => slugOf(schema.heartbeatMonitors, id);

export async function incidentNumber(id: string): Promise<string> {
  const [row] = await db()
    .select({ number: schema.incidents.number })
    .from(schema.incidents)
    .where(eq(schema.incidents.id, id))
    .limit(1);
  return row ? String(row.number) : id;
}
