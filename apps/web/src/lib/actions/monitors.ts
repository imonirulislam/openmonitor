"use server";

import {
  and,
  assertion as assertionSchema,
  db,
  eq,
  isNull,
  monitorKinds,
  or,
  REGION_POLICIES,
  schema,
} from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "~/auth";
import { logAudit } from "~/lib/audit";
import { parseOrFlash } from "~/lib/zod-flash";

// HTML checkboxes don't submit a value when unchecked, so the field is
// missing from FormData entirely. We can't rely on Zod's default(true) — it
// would fire for both "field absent because unchecked" and "field absent
// because not in form", and we need to distinguish unchecked-->false.
// Read `enabled` separately via formData.get() before parsing the rest.
function readEnabled(formData: FormData): boolean {
  return formData.get("enabled") === "true";
}

const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, and dashes only");

/**
 * Master config schema. Mirrors the form shape — the form posts a single
 * `payload` JSON field carrying all of these fields. Per-kind required-fields
 * are enforced by `superRefine` since Zod's discriminated-union doesn't combine
 * neatly with shared keys (slug/name/headers/etc).
 */
const configSchema = z
  .object({
    slug: slugSchema,
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional().default(""),
    kind: z.enum(monitorKinds),
    active: z.boolean().default(true),
    url: z.string().optional().default(""),
    method: z.enum(["GET", "POST", "HEAD", "PUT", "DELETE", "PATCH"]).optional().default("GET"),
    headers: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
    body: z.string().optional().default(""),
    hostPort: z.string().optional().default(""),
    dnsHost: z.string().optional().default(""),
    followRedirects: z.boolean().default(true),
    assertions: z.array(assertionSchema).default([]),
    // probe_locations this monitor is probed from. Not a monitor column —
    // persisted into probe_location_monitors by syncProbeLocations().
    probeLocationIds: z.array(z.string().uuid()).default([]),
    regionPolicy: z.enum(REGION_POLICIES).default("any"),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "http") {
      if (!v.url || !/^https?:\/\//i.test(v.url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "URL must start with http:// or https://",
          path: ["url"],
        });
      }
    } else if (v.kind === "tcp") {
      if (!v.hostPort) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Host:Port is required",
          path: ["hostPort"],
        });
      } else if (parseHostPort(v.hostPort) === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Expected host:port (e.g. example.com:443)",
          path: ["hostPort"],
        });
      }
    } else if (v.kind === "dns") {
      if (!v.dnsHost) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "URI is required",
          path: ["dnsHost"],
        });
      }
    }
  });

const responseTimeSchema = z.object({
  degradedAfterMs: z
    .union([z.coerce.number().int().min(0).max(120_000), z.literal("").transform(() => undefined)])
    .optional(),
  timeoutMs: z.coerce.number().int().min(500).max(120_000),
});

/**
 * Parse a "host:port" / "[ipv6]:port" string into its parts. Returns null on
 * malformed input. Accepts:
 *   example.com:443
 *   192.168.1.1:443
 *   [2001:db8::1]:443
 */
function parseHostPort(input: string): { host: string; port: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // [ipv6]:port
  const v6 = trimmed.match(/^\[([^\]]+)\]:(\d{1,5})$/);
  if (v6) {
    const port = Number.parseInt(v6[2]!, 10);
    if (port >= 1 && port <= 65535) return { host: v6[1]!, port };
    return null;
  }
  // host:port
  const idx = trimmed.lastIndexOf(":");
  if (idx <= 0) return null;
  const host = trimmed.slice(0, idx);
  const port = Number.parseInt(trimmed.slice(idx + 1), 10);
  if (!host || !Number.isFinite(port) || port < 1 || port > 65535) return null;
  return { host, port };
}

/**
 * Map the form payload to the actual DB columns. Empty/per-kind-disallowed
 * fields are nulled so we don't carry stale TCP host on an HTTP monitor.
 */
function configToColumns(parsed: z.infer<typeof configSchema>) {
  const base = {
    slug: parsed.slug,
    name: parsed.name,
    description: parsed.description?.trim() ? parsed.description : null,
    kind: parsed.kind,
    headers: parsed.headers,
    assertions: parsed.assertions,
    followRedirects: parsed.followRedirects,
    regionPolicy: parsed.regionPolicy,
    enabled: parsed.active,
  } as const;
  if (parsed.kind === "http") {
    return {
      ...base,
      url: parsed.url,
      method: parsed.method ?? "GET",
      body: parsed.body?.trim() ? parsed.body : null,
      host: null,
      port: null,
    };
  }
  if (parsed.kind === "tcp") {
    const hp = parseHostPort(parsed.hostPort)!; // validated upstream
    return {
      ...base,
      url: null,
      method: null,
      body: null,
      host: hp.host,
      port: hp.port,
    };
  }
  // dns
  return {
    ...base,
    url: null,
    method: null,
    body: null,
    host: parsed.dnsHost,
    port: null,
  };
}

async function requireEditor() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "viewer") {
    throw new Error("forbidden: editor role required");
  }
  if (!session.user.workspaceId) {
    throw new Error("no workspace bound to session");
  }
  return session;
}

/**
 * Scope all monitor reads/writes to the current workspace. The combination
 * `(monitor_id, workspace_id)` ensures a malicious or buggy client can't pass
 * a UUID belonging to another workspace.
 */
function monitorScope(id: string, workspaceId: string) {
  return and(eq(schema.monitors.id, id), eq(schema.monitors.workspaceId, workspaceId));
}

/**
 * Parse the JSON `payload` field posted by the new RHF MonitorConfigForm.
 * `parseOrFlash` redirects with a toast on failure.
 */
function parseConfigPayload(formData: FormData, destination: string) {
  const raw = formData.get("payload");
  let json: unknown = {};
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch {
      redirect(withToastRedirect(destination, "Invalid form payload", "error"));
    }
  }
  return parseOrFlash(configSchema, json, destination);
}

/**
 * Replaces a monitor's probe-location assignments. Accepts shared locations
 * (workspace_id IS NULL) plus this workspace's own private ones, so a poisoned
 * payload can't attach another tenant's private location.
 */
async function syncProbeLocations(
  tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
  monitorId: string,
  workspaceId: string,
  requestedIds: string[],
) {
  const selectable = await tx
    .select({ id: schema.probeLocations.id })
    .from(schema.probeLocations)
    .where(
      or(
        isNull(schema.probeLocations.workspaceId),
        eq(schema.probeLocations.workspaceId, workspaceId),
      ),
    );
  const allowed = new Set(selectable.map((l) => l.id));
  const toAssign = requestedIds.filter((id) => allowed.has(id));

  await tx
    .delete(schema.probeLocationMonitors)
    .where(eq(schema.probeLocationMonitors.monitorId, monitorId));
  if (toAssign.length > 0) {
    await tx
      .insert(schema.probeLocationMonitors)
      .values(toAssign.map((probeLocationId) => ({ probeLocationId, monitorId })));
  }
}

export async function createMonitor(formData: FormData) {
  const session = await requireEditor();
  const parsed = parseConfigPayload(formData, "/dashboard/monitors/new");
  const cols = configToColumns(parsed);
  const created = await db().transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.monitors)
      .values({
        workspaceId: session.user.workspaceId,
        ...cols,
      })
      .returning({ id: schema.monitors.id });
    if (row) {
      await syncProbeLocations(tx, row.id, session.user.workspaceId, parsed.probeLocationIds);
    }
    return row;
  });
  await logAudit({
    action: "monitor.created",
    targetType: "monitor",
    targetId: created?.id,
    targetLabel: parsed.name,
    metadata: { slug: parsed.slug, kind: parsed.kind },
  });
  revalidatePath("/dashboard/monitors");
  if (created) {
    // Land on the edit page so the user can configure response-time + schedule.
    redirect(
      withToastRedirect(`/dashboard/monitors/${created.id}/edit`, `Created “${parsed.name}”`),
    );
  }
  redirect(withToastRedirect("/dashboard/monitors", `Created “${parsed.name}”`));
}

/**
 * Replace the General slice of an existing monitor — name, kind-specific
 * fields, headers, body, assertions, and the active toggle. Schedule and
 * response-time live on their own actions.
 */
export async function updateMonitorConfig(id: string, formData: FormData) {
  const session = await requireEditor();
  const parsed = parseConfigPayload(formData, `/dashboard/monitors/${id}/edit`);
  const cols = configToColumns(parsed);
  await db().transaction(async (tx) => {
    await tx
      .update(schema.monitors)
      .set({
        ...cols,
        updatedAt: new Date(),
      })
      .where(monitorScope(id, session.user.workspaceId));
    await syncProbeLocations(tx, id, session.user.workspaceId, parsed.probeLocationIds);
  });
  await logAudit({
    action: "monitor.updated.config",
    targetType: "monitor",
    targetId: id,
    targetLabel: parsed.name,
    metadata: { kind: parsed.kind, assertions: parsed.assertions.length },
  });
  revalidatePath(`/dashboard/monitors/${id}`);
  redirect(withToastRedirect(`/dashboard/monitors/${id}/edit`, "Configuration saved"));
}

export async function updateMonitorResponseTime(id: string, formData: FormData) {
  const session = await requireEditor();
  const raw = formData.get("payload");
  let json: unknown = {};
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch {
      redirect(
        withToastRedirect(`/dashboard/monitors/${id}/edit`, "Invalid form payload", "error"),
      );
    }
  }
  const parsed = parseOrFlash(responseTimeSchema, json, `/dashboard/monitors/${id}/edit`);
  await db()
    .update(schema.monitors)
    .set({
      degradedAfterMs: parsed.degradedAfterMs ?? null,
      timeoutMs: parsed.timeoutMs,
      updatedAt: new Date(),
    })
    .where(monitorScope(id, session.user.workspaceId));
  await logAudit({
    action: "monitor.updated.response_time",
    targetType: "monitor",
    targetId: id,
    targetLabel: null,
    metadata: { degradedAfterMs: parsed.degradedAfterMs ?? null, timeoutMs: parsed.timeoutMs },
  });
  revalidatePath(`/dashboard/monitors/${id}`);
  redirect(withToastRedirect(`/dashboard/monitors/${id}/edit`, "Response time saved"));
}

export async function deleteMonitor(id: string) {
  const session = await requireEditor();
  const [existing] = await db()
    .select({ name: schema.monitors.name })
    .from(schema.monitors)
    .where(monitorScope(id, session.user.workspaceId))
    .limit(1);
  await db().delete(schema.monitors).where(monitorScope(id, session.user.workspaceId));
  await logAudit({
    action: "monitor.deleted",
    targetType: "monitor",
    targetId: id,
    targetLabel: existing?.name ?? null,
  });
  revalidatePath("/dashboard/monitors");
  redirect(withToastRedirect("/dashboard/monitors", "Monitor deleted", "info"));
}

/**
 * Toggle a monitor's enabled flag. Used by the row 3-dot menu and the bulk
 * action toolbar. Returns toast on the listing page either way.
 */
export async function toggleMonitorEnabled(id: string, next: boolean) {
  const session = await requireEditor();
  await db()
    .update(schema.monitors)
    .set({ enabled: next, updatedAt: new Date() })
    .where(monitorScope(id, session.user.workspaceId));
  await logAudit({
    action: next ? "monitor.enabled" : "monitor.disabled",
    targetType: "monitor",
    targetId: id,
    targetLabel: null,
  });
  revalidatePath("/dashboard/monitors");
  redirect(
    withToastRedirect(
      "/dashboard/monitors",
      next ? "Monitor enabled" : "Monitor disabled",
      next ? "success" : "info",
    ),
  );
}

// ---------- Slice actions for the per-FormCard edit page ----------

const scheduleSchema = z.object({
  intervalSeconds: z.coerce.number().int().min(30).max(3600),
  retryCount: z.coerce.number().int().min(0).max(10).default(0),
  retryDelaySeconds: z.coerce.number().int().min(1).max(300).default(5),
  // Empty string from the form coerces to undefined; 0 is treated as
  // "disabled" by the probes route. Stored as nullable in the DB.
  autoIncidentThreshold: z
    .union([z.literal("").transform(() => null), z.coerce.number().int().min(0).max(50)])
    .optional()
    .nullable(),
});

export async function updateMonitorSchedule(id: string, formData: FormData) {
  const session = await requireEditor();
  const parsed = parseOrFlash(
    scheduleSchema,
    Object.fromEntries(formData),
    `/dashboard/monitors/${id}/edit`,
  );
  const enabled = readEnabled(formData);
  const autoIncidentThreshold =
    parsed.autoIncidentThreshold == null || parsed.autoIncidentThreshold === 0
      ? null
      : parsed.autoIncidentThreshold;
  await db()
    .update(schema.monitors)
    .set({
      intervalSeconds: parsed.intervalSeconds,
      retryCount: parsed.retryCount,
      retryDelaySeconds: parsed.retryDelaySeconds,
      autoIncidentThreshold,
      enabled,
      updatedAt: new Date(),
    })
    .where(monitorScope(id, session.user.workspaceId));
  const [m] = await db()
    .select({ name: schema.monitors.name })
    .from(schema.monitors)
    .where(monitorScope(id, session.user.workspaceId))
    .limit(1);
  await logAudit({
    action: "monitor.updated.schedule",
    targetType: "monitor",
    targetId: id,
    targetLabel: m?.name ?? null,
    metadata: {
      intervalSeconds: parsed.intervalSeconds,
      retryCount: parsed.retryCount,
      retryDelaySeconds: parsed.retryDelaySeconds,
      autoIncidentThreshold,
      enabled,
    },
  });
  revalidatePath(`/dashboard/monitors/${id}`);
  redirect(withToastRedirect(`/dashboard/monitors/${id}/edit`, "Schedule saved"));
}
