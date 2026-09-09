"use server";

import { and, db, eq, inArray, schema } from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "~/auth";
import { parseOrFlash } from "~/lib/zod-flash";

const maintenanceSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  monitorIds: z.array(z.string().uuid()).default([]),
  // Optional iCal RRULE. The form lets editors pick "Weekly"/"Monthly" presets
  // (which we expand into RRULE strings client-side) or paste a raw rule.
  recurrenceRule: z.string().max(500).optional(),
  recurrenceUntil: z.string().datetime().optional(),
});

async function requireEditor() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "viewer") throw new Error("forbidden");
  if (!session.user.workspaceId) throw new Error("no workspace bound to session");
  return session;
}

export async function createMaintenance(formData: FormData) {
  const session = await requireEditor();
  const monitorIds = formData.getAll("monitorIds").map(String);
  const rrule = (formData.get("recurrenceRule") as string | null)?.trim();
  const ruleUntil = (formData.get("recurrenceUntil") as string | null)?.trim();
  const parsed = parseOrFlash(
    maintenanceSchema,
    {
      title: formData.get("title"),
      description: formData.get("description"),
      startsAt: formData.get("startsAt"),
      endsAt: formData.get("endsAt"),
      monitorIds,
      recurrenceRule: rrule ? rrule : undefined,
      recurrenceUntil: ruleUntil ? ruleUntil : undefined,
    },
    "/maintenance",
  );

  await db().transaction(async (tx) => {
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

    const [m] = await tx
      .insert(schema.maintenances)
      .values({
        workspaceId: session.user.workspaceId,
        title: parsed.title,
        description: parsed.description ?? null,
        startsAt: new Date(parsed.startsAt),
        endsAt: new Date(parsed.endsAt),
        recurrenceRule: parsed.recurrenceRule ?? null,
        recurrenceUntil: parsed.recurrenceUntil ? new Date(parsed.recurrenceUntil) : null,
        createdBy: session.user.id,
      })
      .returning({ id: schema.maintenances.id });
    if (!m) throw new Error("failed to create maintenance");

    if (parsed.monitorIds.length > 0) {
      await tx.insert(schema.maintenanceMonitors).values(
        parsed.monitorIds.map((monitorId) => ({
          maintenanceId: m.id,
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
      type: "maintenance.scheduled",
      payload: {
        maintenance: {
          id: m.id,
          title: parsed.title,
          description: parsed.description ?? null,
        },
        monitorIds: parsed.monitorIds,
        monitorNames,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
      },
    });
  });

  revalidatePath("/maintenance");
  redirect(withToastRedirect("/maintenance", `Scheduled “${parsed.title}”`));
}

/** Cancel an upcoming or in-progress maintenance window. */
export async function cancelMaintenance(id: string) {
  const session = await requireEditor();
  await db()
    .update(schema.maintenances)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(schema.maintenances.id, id),
        eq(schema.maintenances.workspaceId, session.user.workspaceId),
      ),
    );
  revalidatePath("/maintenance");
  redirect(withToastRedirect("/maintenance", "Maintenance cancelled", "info"));
}

export async function deleteMaintenance(id: string) {
  const session = await requireEditor();
  await db()
    .delete(schema.maintenances)
    .where(
      and(
        eq(schema.maintenances.id, id),
        eq(schema.maintenances.workspaceId, session.user.workspaceId),
      ),
    );
  revalidatePath("/maintenance");
  redirect(withToastRedirect("/maintenance", "Maintenance deleted", "info"));
}
