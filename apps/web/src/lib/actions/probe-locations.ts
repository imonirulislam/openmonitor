"use server";

import {
  and,
  db,
  eq,
  generateProbeToken,
  hashProbeToken,
  inArray,
  isNull,
  or,
  schema,
} from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isOperator } from "~/lib/operator";
import { requireAdmin, requireEditor } from "~/lib/workspace";
import { parseOrFlash } from "~/lib/zod-flash";

const PATH = "/settings/probe-locations";

/** Shared locations plus this workspace's own private ones. */
const visibleTo = (workspaceId: string) =>
  or(isNull(schema.probeLocations.workspaceId), eq(schema.probeLocations.workspaceId, workspaceId));

const locationSchema = z.object({
  name: z.string().min(1).max(100),
  // Stored on every probe result and used as the reduction key, so keep it to
  // the shape people expect in a region column.
  region: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers and dashes only"),
  // Optional. @openmonitor/regions infers one from the code, which is wrong
  // for a self-hosted box reusing an IATA name; this overrides it.
  provider: z.string().max(50).optional(),
});

/**
 * Loads a location the caller is allowed to change, and decides who that is.
 *
 * The two kinds of location have different owners, so one role check can't
 * cover both. A shared row (workspaceId null) is the deployment's own fleet:
 * rotating its token breaks probing for every tenant using that region until
 * their checkers are redeployed, so it takes an instance operator. A private
 * row belongs to one workspace and its admin owns it outright.
 *
 * `admin` alone is not sufficient for the shared case — it comes from
 * workspace_members, so anyone who creates a workspace is an admin of it.
 */
async function requireMutableLocation(id: string) {
  const ws = await requireEditor();

  const [location] = await db()
    .select({
      id: schema.probeLocations.id,
      region: schema.probeLocations.region,
      workspaceId: schema.probeLocations.workspaceId,
    })
    .from(schema.probeLocations)
    .where(and(eq(schema.probeLocations.id, id), visibleTo(ws.workspaceId)))
    .limit(1);
  if (!location) throw new Error("probe location not found");

  if (location.workspaceId === null) {
    if (!isOperator(ws.email)) {
      throw new Error("forbidden: shared probe locations are managed by the instance operator");
    }
  } else if (ws.role !== "admin") {
    throw new Error("forbidden");
  }

  return { ws, location };
}

/**
 * Creates a location and returns its token exactly once, via the redirect
 * query string. Only the hash is stored, so there is no way to show it again —
 * losing it means rotating.
 */
export async function createProbeLocation(formData: FormData) {
  const ws = await requireAdmin();
  const parsed = parseOrFlash(locationSchema, Object.fromEntries(formData), PATH);

  // Default to a private location owned by the caller's workspace. Only an
  // instance operator can add to the shared fleet, because every other tenant
  // then gets to select it.
  const wantsShared = formData.get("shared") === "on";
  if (wantsShared && !isOperator(ws.email)) {
    throw new Error("forbidden: only the instance operator can create shared locations");
  }

  const token = generateProbeToken();
  const [created] = await db()
    .insert(schema.probeLocations)
    .values({
      workspaceId: wantsShared ? null : ws.workspaceId,
      name: parsed.name,
      region: parsed.region,
      provider: parsed.provider ? parsed.provider : null,
      tokenHash: hashProbeToken(token),
    })
    .returning({ id: schema.probeLocations.id });
  if (!created) throw new Error("failed to create probe location");

  revalidatePath(PATH);
  redirect(`${PATH}?created=${created.id}&token=${encodeURIComponent(token)}`);
}

/** Invalidates the old token immediately; any checker still using it gets 401. */
export async function rotateProbeLocationToken(id: string) {
  await requireMutableLocation(id);
  const token = generateProbeToken();

  const [updated] = await db()
    .update(schema.probeLocations)
    .set({ tokenHash: hashProbeToken(token), updatedAt: new Date() })
    .where(eq(schema.probeLocations.id, id))
    .returning({ id: schema.probeLocations.id });
  if (!updated) throw new Error("probe location not found");

  revalidatePath(PATH);
  redirect(`${PATH}?created=${updated.id}&token=${encodeURIComponent(token)}&rotated=1`);
}

export async function setProbeLocationEnabled(id: string, enabled: boolean) {
  await requireMutableLocation(id);
  await db()
    .update(schema.probeLocations)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(schema.probeLocations.id, id));
  revalidatePath(PATH);
  redirect(withToastRedirect(PATH, enabled ? "Location enabled" : "Location disabled", "info"));
}

/**
 * Also clears this region's rows in monitor_region_status, so the derived
 * status stops counting a region that will never report again.
 */
export async function deleteProbeLocation(id: string) {
  const { location } = await requireMutableLocation(id);

  await db().transaction(async (tx) => {
    // Which monitors this location covered, read before the delete — cascading
    // the location away takes its assignment rows with it.
    const covered = await tx
      .select({ monitorId: schema.probeLocationMonitors.monitorId })
      .from(schema.probeLocationMonitors)
      .where(eq(schema.probeLocationMonitors.probeLocationId, id));
    const coveredIds = covered.map((c) => c.monitorId);

    await tx.delete(schema.probeLocations).where(eq(schema.probeLocations.id, id));
    if (coveredIds.length === 0) return;

    // monitor_region_status is keyed by region string, not by location id, so
    // cascade doesn't reach it. Left behind, the stale row keeps voting in the
    // reduction forever.
    //
    // Scoping this to the caller's workspace would be wrong for a shared
    // location, whose monitors span tenants — everyone else would keep a stale
    // row. Scope to the monitors this location actually covered instead, minus
    // any that another location still probes under the same region name, since
    // those names aren't unique: a workspace's private "eu-west" has to survive
    // the shared "eu-west" being removed.
    const stillCovered = await tx
      .select({ monitorId: schema.probeLocationMonitors.monitorId })
      .from(schema.probeLocationMonitors)
      .innerJoin(
        schema.probeLocations,
        eq(schema.probeLocations.id, schema.probeLocationMonitors.probeLocationId),
      )
      .where(
        and(
          eq(schema.probeLocations.region, location.region),
          inArray(schema.probeLocationMonitors.monitorId, coveredIds),
        ),
      );

    const keep = new Set(stillCovered.map((s) => s.monitorId));
    const orphaned = coveredIds.filter((m) => !keep.has(m));
    if (orphaned.length === 0) return;

    await tx
      .delete(schema.monitorRegionStatus)
      .where(
        and(
          eq(schema.monitorRegionStatus.region, location.region),
          inArray(schema.monitorRegionStatus.monitorId, orphaned),
        ),
      );
  });

  revalidatePath(PATH);
  redirect(withToastRedirect(PATH, "Location deleted", "info"));
}

/**
 * Replaces this workspace's assignments for a location, in one transaction.
 *
 * "This workspace's" is load-bearing. A shared location carries assignments
 * from every tenant that selected it, so clearing the whole set and re-inserting
 * the caller's would silently stop probing everyone else's monitors from that
 * region — no error, no audit trail, just results that quietly stop arriving.
 * Both the delete and the insert are therefore scoped to monitors the caller
 * owns, which also means an editor never needs rights over the location itself.
 */
export async function setProbeLocationMonitors(id: string, monitorIds: string[]) {
  const ws = await requireEditor();

  const [location] = await db()
    .select({ id: schema.probeLocations.id })
    .from(schema.probeLocations)
    .where(and(eq(schema.probeLocations.id, id), visibleTo(ws.workspaceId)))
    .limit(1);
  if (!location) throw new Error("probe location not found");

  // Only monitors in this workspace, so a poisoned form can't assign across
  // tenants.
  const owned = await db()
    .select({ id: schema.monitors.id })
    .from(schema.monitors)
    .where(eq(schema.monitors.workspaceId, ws.workspaceId));
  const ownedIds = new Set(owned.map((m) => m.id));
  const toAssign = monitorIds.filter((m) => ownedIds.has(m));

  await db().transaction(async (tx) => {
    await tx
      .delete(schema.probeLocationMonitors)
      .where(
        and(
          eq(schema.probeLocationMonitors.probeLocationId, id),
          inArray(
            schema.probeLocationMonitors.monitorId,
            tx
              .select({ id: schema.monitors.id })
              .from(schema.monitors)
              .where(eq(schema.monitors.workspaceId, ws.workspaceId)),
          ),
        ),
      );
    if (toAssign.length > 0) {
      await tx
        .insert(schema.probeLocationMonitors)
        .values(toAssign.map((monitorId) => ({ probeLocationId: id, monitorId })));
    }
  });

  revalidatePath(PATH);
  redirect(withToastRedirect(PATH, `Assigned ${toAssign.length} monitor(s)`));
}
