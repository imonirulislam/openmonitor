"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, db, eq, schema } from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { logAudit } from "~/lib/audit";
import { getCurrentWorkspace } from "~/lib/workspace";
import { parseOrFlash } from "~/lib/zod-flash";

const writeSchema = z.object({
  name: z.string().min(1).max(200),
  titleTemplate: z.string().min(1).max(300),
  messageTemplate: z.string().min(1).max(5000),
});

async function requireEditor() {
  const ws = await getCurrentWorkspace();
  if (ws.role === "viewer") throw new Error("forbidden: editor role required");
  return ws;
}

function templateScope(id: string, workspaceId: string) {
  return and(
    eq(schema.incidentTemplates.id, id),
    eq(schema.incidentTemplates.workspaceId, workspaceId),
  );
}

export async function createIncidentTemplate(formData: FormData) {
  const ws = await requireEditor();
  const parsed = parseOrFlash(
    writeSchema,
    Object.fromEntries(formData),
    "/dashboard/settings/templates",
  );

  await db().insert(schema.incidentTemplates).values({
    workspaceId: ws.workspaceId,
    name: parsed.name,
    titleTemplate: parsed.titleTemplate,
    messageTemplate: parsed.messageTemplate,
    createdBy: ws.userId,
  });

  await logAudit({
    action: "incident_template.created",
    targetType: "incident",
    targetId: null,
    targetLabel: parsed.name,
  });

  revalidatePath("/dashboard/settings/templates");
  redirect(
    withToastRedirect("/dashboard/settings/templates", `Created “${parsed.name}”`),
  );
}

export async function updateIncidentTemplate(id: string, formData: FormData) {
  const ws = await requireEditor();
  const parsed = parseOrFlash(
    writeSchema,
    Object.fromEntries(formData),
    "/dashboard/settings/templates",
  );

  await db()
    .update(schema.incidentTemplates)
    .set({
      name: parsed.name,
      titleTemplate: parsed.titleTemplate,
      messageTemplate: parsed.messageTemplate,
      updatedAt: new Date(),
    })
    .where(templateScope(id, ws.workspaceId));

  await logAudit({
    action: "incident_template.updated",
    targetType: "incident",
    targetId: null,
    targetLabel: parsed.name,
  });

  revalidatePath("/dashboard/settings/templates");
  redirect(withToastRedirect("/dashboard/settings/templates", "Template saved"));
}

export async function deleteIncidentTemplate(id: string) {
  const ws = await requireEditor();
  await db().delete(schema.incidentTemplates).where(templateScope(id, ws.workspaceId));
  await logAudit({
    action: "incident_template.deleted",
    targetType: "incident",
    targetId: null,
  });
  revalidatePath("/dashboard/settings/templates");
  redirect(
    withToastRedirect("/dashboard/settings/templates", "Template deleted", "info"),
  );
}
