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
import { isOperator } from "~/lib/operator";
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

async function requireAdmin() {
  const session = await requireEditor();
  if (session.user.role !== "admin") throw new Error("forbidden");
  return session;
}

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
  const session = await requireEditor();

  const [location] = await db()
    .select({
      id: schema.probeLocations.id,
      region: schema.probeLocations.region,
      workspaceId: schema.probeLocations.workspaceId,
    })
    .from(schema.probeLocations)
    .where(and(eq(schema.probeLocations.id, id), visibleTo(session.user.workspaceId)))
    .limit(1);
  if (!location) throw new Error("probe location not found");

  if (location.workspaceId === null) {
    if (!isOperator(session.user.email)) {
      throw new Error("forbidden: shared probe locations are managed by the instance operator");
    }
  } else if (session.user.role !== "admin") {
    throw new Error("forbidden");
  }

  return { session, location };
}

/**
 * Creates a location and returns its token exactly once, via the redirect
 * query string. Only the hash is stored, so there is no way to show it again —
 * losing it means rotating.
 */
export async function createProbeLocation(formData: FormData) {
  const session = await requireAdmin();
  const parsed = parseOrFlash(locationSchema, Object.fromEntries(formData), PATH);

  // Default to a private location owned by the caller's workspace. Only an
  // instance operator can add to the shared fleet, because every other tenant
  // then gets to select it.
  const wantsShared = formData.get("shared") === "on";
  if (wantsShared && !isOperator(session.user.email)) {
    throw new Error("forbidden: only the instance operator can create shared locations");
  }

  const token = generateProbeToken();
  const [created] = await db()
    .insert(schema.probeLocations)
    .values({
      workspaceId: wantsShared ? null : session.user.workspaceId,
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
  const { session, location } = await requireMutableLocation(id);

  await db().transaction(async (tx) => {
    await tx.delete(schema.probeLocations).where(eq(schema.probeLocations.id, id));
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
      .where(
        and(
          eq(schema.probeLocationMonitors.probeLocationId, id),
          inArray(
            schema.probeLocationMonitors.monitorId,
            tx
              .select({ id: schema.monitors.id })
              .from(schema.monitors)
              .where(eq(schema.monitors.workspaceId, session.user.workspaceId)),
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
