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
import { auth } from "~/auth";
import { parseOrFlash } from "~/lib/zod-flash";

const PATH = "/dashboard/settings/probe-locations";

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
});

async function requireEditor() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "viewer") throw new Error("forbidden");
  if (!session.user.workspaceId) throw new Error("no workspace bound to session");
  return session;
}

/**
 * Shared locations are deployment-wide infrastructure that every workspace can
 * select, so creating or destroying one is an operator action — an editor in one
 * tenant must not be able to change what other tenants can probe from.
 */
async function requireAdmin() {
  const session = await requireEditor();
  if (session.user.role !== "admin") throw new Error("forbidden");
  return session;
}

/**
 * Creates a location and returns its token exactly once, via the redirect
 * query string. Only the hash is stored, so there is no way to show it again —
 * losing it means rotating.
 */
export async function createProbeLocation(formData: FormData) {
  await requireAdmin();
  const parsed = parseOrFlash(locationSchema, Object.fromEntries(formData), PATH);

  const token = generateProbeToken();
  const [created] = await db()
    .insert(schema.probeLocations)
    .values({
      // Shared: this deployment's own fleet. Per-workspace private locations
      // are a separate feature and aren't creatable here yet.
      workspaceId: null,
      name: parsed.name,
      region: parsed.region,
      tokenHash: hashProbeToken(token),
    })
    .returning({ id: schema.probeLocations.id });
  if (!created) throw new Error("failed to create probe location");

  revalidatePath(PATH);
  redirect(`${PATH}?created=${created.id}&token=${encodeURIComponent(token)}`);
}

/** Invalidates the old token immediately; any checker still using it gets 401. */
export async function rotateProbeLocationToken(id: string) {
  const session = await requireAdmin();
  const token = generateProbeToken();

  const [updated] = await db()
    .update(schema.probeLocations)
    .set({ tokenHash: hashProbeToken(token), updatedAt: new Date() })
    .where(and(eq(schema.probeLocations.id, id), visibleTo(session.user.workspaceId)))
    .returning({ id: schema.probeLocations.id });
  if (!updated) throw new Error("probe location not found");

  revalidatePath(PATH);
  redirect(`${PATH}?created=${updated.id}&token=${encodeURIComponent(token)}&rotated=1`);
}

export async function setProbeLocationEnabled(id: string, enabled: boolean) {
  const session = await requireAdmin();
  await db()
    .update(schema.probeLocations)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(schema.probeLocations.id, id), visibleTo(session.user.workspaceId)));
  revalidatePath(PATH);
  redirect(withToastRedirect(PATH, enabled ? "Location enabled" : "Location disabled", "info"));
}

/**
 * Also clears this region's rows in monitor_region_status, so the derived
 * status stops counting a region that will never report again.
 */
export async function deleteProbeLocation(id: string) {
  const session = await requireAdmin();
  const [location] = await db()
    .select({ region: schema.probeLocations.region })
    .from(schema.probeLocations)
    .where(and(eq(schema.probeLocations.id, id), visibleTo(session.user.workspaceId)))
    .limit(1);
  if (!location) throw new Error("probe location not found");

  await db().transaction(async (tx) => {
    await tx
      .delete(schema.probeLocations)
      .where(and(eq(schema.probeLocations.id, id), visibleTo(session.user.workspaceId)));
    // monitor_region_status is keyed by region string, not by location id, so
    // cascade doesn't reach it. Left behind, the stale row keeps voting in the
    // reduction forever.
    //
    // Scoped to this workspace's monitors: region names are not globally
    // unique, so two workspaces can each have a "eu-west" and deleting one
    // must not touch the other's rows.
    await tx
      .delete(schema.monitorRegionStatus)
      .where(
        and(
          eq(schema.monitorRegionStatus.region, location.region),
          inArray(
            schema.monitorRegionStatus.monitorId,
            tx
              .select({ id: schema.monitors.id })
              .from(schema.monitors)
              .where(eq(schema.monitors.workspaceId, session.user.workspaceId)),
          ),
        ),
      );
  });

  revalidatePath(PATH);
  redirect(withToastRedirect(PATH, "Location deleted", "info"));
}

/** Replaces the whole assignment set for a location in one transaction. */
export async function setProbeLocationMonitors(id: string, monitorIds: string[]) {
  const session = await requireEditor();

  const [location] = await db()
    .select({ id: schema.probeLocations.id })
    .from(schema.probeLocations)
    .where(and(eq(schema.probeLocations.id, id), visibleTo(session.user.workspaceId)))
    .limit(1);
  if (!location) throw new Error("probe location not found");

  // Only monitors in this workspace, so a poisoned form can't assign across
  // tenants.
  const owned = await db()
    .select({ id: schema.monitors.id })
    .from(schema.monitors)
    .where(eq(schema.monitors.workspaceId, session.user.workspaceId));
  const ownedIds = new Set(owned.map((m) => m.id));
  const toAssign = monitorIds.filter((m) => ownedIds.has(m));

  await db().transaction(async (tx) => {
    await tx
      .delete(schema.probeLocationMonitors)
      .where(eq(schema.probeLocationMonitors.probeLocationId, id));
    if (toAssign.length > 0) {
      await tx
        .insert(schema.probeLocationMonitors)
        .values(toAssign.map((monitorId) => ({ probeLocationId: id, monitorId })));
    }
  });

  revalidatePath(PATH);
  redirect(withToastRedirect(PATH, `Assigned ${toAssign.length} monitor(s)`));
}
