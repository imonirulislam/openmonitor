"use server";

import { and, db, eq, inArray, schema } from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "~/auth";
import { logAudit } from "~/lib/audit";
import { parseOrFlash } from "~/lib/zod-flash";

const createIncidentSchema = z.object({
  title: z.string().min(1).max(300),
  severity: z.enum(["minor", "major", "critical"]).default("minor"),
  status: z
    .enum(["investigating", "identified", "monitoring", "resolved"])
    .default("investigating"),
  message: z.string().min(1).max(5000),
  monitorIds: z.array(z.string().uuid()).default([]),
});

const updateSchema = z.object({
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  message: z.string().min(1).max(5000),
});

async function requireEditor() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "viewer") throw new Error("forbidden");
  if (!session.user.workspaceId) throw new Error("no workspace bound to session");
  return session;
}

export async function createIncident(formData: FormData) {
  const session = await requireEditor();
  const monitorIds = formData.getAll("monitorIds").map(String);
  const parsed = parseOrFlash(
    createIncidentSchema,
    {
      title: formData.get("title"),
      severity: formData.get("severity"),
      status: formData.get("status"),
      message: formData.get("message"),
      monitorIds,
    },
    // Validation errors bounce to the status-pages list. Creation now lives
    // inside per-page Status Reports tabs (Sheet); the server action doesn't
    // know which page initiated, so we use the workspace status-pages list as
    // a sensible fallback.
    "/dashboard/status-pages",
  );

  const incidentId = await db().transaction(async (tx) => {
    // Sanity-check: every linked monitor must belong to the current workspace.
    if (parsed.monitorIds.length > 0) {
      const valid = await tx
        .select({ id: schema.monitors.id })
        .from(schema.monitors)
        .where(
          and(
            inArray(schema.monitors.id, parsed.monitorIds),
            eq(schema.monitors.workspaceId, session.user.workspaceId),
          ),
        );
      if (valid.length !== parsed.monitorIds.length) {
        throw new Error("forbidden: monitor not in workspace");
      }
    }

    const [incident] = await tx
      .insert(schema.incidents)
      .values({
        workspaceId: session.user.workspaceId,
        title: parsed.title,
        severity: parsed.severity,
        status: parsed.status,
        createdBy: session.user.id,
      })
      .returning({ id: schema.incidents.id });
    if (!incident) throw new Error("failed to create incident");

    await tx.insert(schema.incidentUpdates).values({
      incidentId: incident.id,
      status: parsed.status,
      message: parsed.message,
      createdBy: session.user.id,
    });

    if (parsed.monitorIds.length > 0) {
      await tx.insert(schema.incidentMonitors).values(
        parsed.monitorIds.map((monitorId) => ({
          incidentId: incident.id,
          monitorId,
        })),
      );
    }

    const monitorNames =
      parsed.monitorIds.length > 0
        ? (
            await tx
              .select({ name: schema.monitors.name })
              .from(schema.monitors)
              .where(inArray(schema.monitors.id, parsed.monitorIds))
          ).map((r) => r.name)
        : [];

    await tx.insert(schema.events).values({
      workspaceId: session.user.workspaceId,
      type: "incident.created",
      payload: {
        incident: {
          id: incident.id,
          title: parsed.title,
          status: parsed.status,
          severity: parsed.severity,
        },
        monitorIds: parsed.monitorIds,
        monitorNames,
        message: parsed.message,
      },
    });

    return incident.id;
  });

  await logAudit({
    action: "incident.created",
    targetType: "incident",
    targetId: incidentId,
    targetLabel: parsed.title,
    metadata: { severity: parsed.severity, status: parsed.status },
  });
  revalidatePath("/dashboard/incidents");
  redirect(withToastRedirect(`/dashboard/incidents/${incidentId}`, `Opened “${parsed.title}”`));
}

export async function postIncidentUpdate(incidentId: string, formData: FormData) {
  const session = await requireEditor();
  const parsed = parseOrFlash(
    updateSchema,
    {
      status: formData.get("status"),
      message: formData.get("message"),
    },
    `/dashboard/incidents/${incidentId}`,
  );

  await db().transaction(async (tx) => {
    // Verify the incident lives in the current workspace.
    const [incident] = await tx
      .select()
      .from(schema.incidents)
      .where(
        and(
          eq(schema.incidents.id, incidentId),
          eq(schema.incidents.workspaceId, session.user.workspaceId),
        ),
      )
      .limit(1);
    if (!incident) throw new Error("incident not found in workspace");

    await tx.insert(schema.incidentUpdates).values({
      incidentId,
      status: parsed.status,
      message: parsed.message,
      createdBy: session.user.id,
    });

    const updates: Partial<typeof schema.incidents.$inferInsert> = {
      status: parsed.status,
      updatedAt: new Date(),
    };
    if (parsed.status === "resolved") updates.resolvedAt = new Date();

    await tx.update(schema.incidents).set(updates).where(eq(schema.incidents.id, incidentId));

    const linkedMonitors = await tx
      .select({ id: schema.monitors.id, name: schema.monitors.name })
      .from(schema.incidentMonitors)
      .innerJoin(schema.monitors, eq(schema.monitors.id, schema.incidentMonitors.monitorId))
      .where(eq(schema.incidentMonitors.incidentId, incidentId));

    await tx.insert(schema.events).values({
      workspaceId: session.user.workspaceId,
      type: parsed.status === "resolved" ? "incident.resolved" : "incident.updated",
      payload: {
        incident: {
          id: incident.id,
          title: incident.title,
          status: parsed.status,
          severity: incident.severity,
        },
        monitorIds: linkedMonitors.map((m) => m.id),
        monitorNames: linkedMonitors.map((m) => m.name),
        message: parsed.message,
      },
    });
  });

  await logAudit({
    action: parsed.status === "resolved" ? "incident.resolved" : "incident.updated",
    targetType: "incident",
    targetId: incidentId,
    metadata: { status: parsed.status },
  });
  revalidatePath(`/dashboard/incidents/${incidentId}`);
  revalidatePath("/dashboard/incidents");
  redirect(
    withToastRedirect(
      `/dashboard/incidents/${incidentId}`,
      parsed.status === "resolved" ? "Incident resolved" : "Update posted",
    ),
  );
}
