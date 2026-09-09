"use server";

import { randomBytes } from "node:crypto";
import { and, db, eq, schema } from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAudit } from "~/lib/audit";
import { heartbeatSlug } from "~/lib/resolve-entity";
import { getCurrentWorkspace } from "~/lib/workspace";
import { parseOrFlash } from "~/lib/zod-flash";

const writeSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, and dashes only"),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  expectedIntervalSeconds: z.coerce.number().int().min(30).max(86_400).default(300),
  graceSeconds: z.coerce.number().int().min(0).max(3_600).default(60),
});

async function requireEditor() {
  const ws = await getCurrentWorkspace();
  if (ws.role === "viewer") throw new Error("forbidden: editor role required");
  return ws;
}

function scope(id: string, workspaceId: string) {
  return and(
    eq(schema.heartbeatMonitors.id, id),
    eq(schema.heartbeatMonitors.workspaceId, workspaceId),
  );
}

/** 32 random bytes hex-encoded — opaque to anyone who didn't create it. */
function generateToken(): string {
  return randomBytes(20).toString("hex");
}

export async function createHeartbeat(formData: FormData) {
  const ws = await requireEditor();
  const parsed = parseOrFlash(writeSchema, Object.fromEntries(formData), "/heartbeats");

  const enabled = formData.get("enabled") === "true";
  const [created] = await db()
    .insert(schema.heartbeatMonitors)
    .values({
      workspaceId: ws.workspaceId,
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description ?? null,
      expectedIntervalSeconds: parsed.expectedIntervalSeconds,
      graceSeconds: parsed.graceSeconds,
      token: generateToken(),
      enabled,
    })
    .returning({ id: schema.heartbeatMonitors.id });

  await logAudit({
    action: "heartbeat.created",
    targetType: "monitor",
    targetId: created?.id,
    targetLabel: parsed.name,
  });

  revalidatePath("/heartbeats");
  redirect(withToastRedirect(`/heartbeats/${created?.id}`, `Created “${parsed.name}”`));
}

export async function updateHeartbeat(id: string, formData: FormData) {
  const ws = await requireEditor();
  const addr = await heartbeatSlug(id);
  const parsed = parseOrFlash(writeSchema, Object.fromEntries(formData), `/heartbeats/${addr}`);
  const enabled = formData.get("enabled") === "true";

  await db()
    .update(schema.heartbeatMonitors)
    .set({
      slug: parsed.slug,
      name: parsed.name,
      description: parsed.description ?? null,
      expectedIntervalSeconds: parsed.expectedIntervalSeconds,
      graceSeconds: parsed.graceSeconds,
      enabled,
      updatedAt: new Date(),
    })
    .where(scope(id, ws.workspaceId));

  await logAudit({
    action: "heartbeat.updated",
    targetType: "monitor",
    targetId: id,
    targetLabel: parsed.name,
  });

  revalidatePath(`/heartbeats/${addr}`);
  redirect(withToastRedirect("/heartbeats", "Heartbeat saved"));
}

/** Mint a new token, invalidating the old one. */
export async function rotateHeartbeatToken(id: string) {
  const ws = await requireEditor();
  const addr = await heartbeatSlug(id);
  await db()
    .update(schema.heartbeatMonitors)
    .set({ token: generateToken(), updatedAt: new Date() })
    .where(scope(id, ws.workspaceId));
  await logAudit({
    action: "heartbeat.token_rotated",
    targetType: "monitor",
    targetId: id,
  });
  revalidatePath(`/heartbeats/${addr}`);
  redirect(withToastRedirect(`/heartbeats/${addr}`, "Token rotated", "info"));
}

export async function deleteHeartbeat(id: string) {
  const ws = await requireEditor();
  await db().delete(schema.heartbeatMonitors).where(scope(id, ws.workspaceId));
  await logAudit({
    action: "heartbeat.deleted",
    targetType: "monitor",
    targetId: id,
  });
  revalidatePath("/heartbeats");
  redirect(withToastRedirect("/heartbeats", "Heartbeat deleted", "info"));
}
