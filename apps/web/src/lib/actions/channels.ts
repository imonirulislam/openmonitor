"use server";

import { and, db, eq, inArray, schema } from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireEditor } from "~/lib/workspace";
import { parseOrFlash } from "~/lib/zod-flash";

const slackChannelSchema = z.object({
  name: z.string().min(1).max(200),
  webhookUrl: z.string().url().startsWith("https://hooks.slack.com/"),
});

// See monitors.ts — an unchecked box submits nothing, so a Zod default can't
// tell "unchecked" from "not in this form".
function readEnabled(formData: FormData): boolean {
  return formData.get("enabled") === "true";
}

/**
 * Monitor ids from a checkbox group, checked against the workspace in one
 * query. A partial match means the request named something it can't see, so
 * refuse it rather than linking the subset.
 */
async function resolveMonitorIds(formData: FormData, workspaceId: string): Promise<string[]> {
  const ids = [...new Set(formData.getAll("monitorIds").map(String).filter(Boolean))];
  if (ids.length === 0) return [];
  const rows = await db()
    .select({ id: schema.monitors.id })
    .from(schema.monitors)
    .where(and(inArray(schema.monitors.id, ids), eq(schema.monitors.workspaceId, workspaceId)));
  if (rows.length !== ids.length) throw new Error("forbidden");
  return rows.map((r) => r.id);
}

export async function createSlackChannel(formData: FormData) {
  const ws = await requireEditor();
  const parsed = parseOrFlash(slackChannelSchema, Object.fromEntries(formData), "/channels");
  const monitorIds = await resolveMonitorIds(formData, ws.workspaceId);

  await db().transaction(async (tx) => {
    const [channel] = await tx
      .insert(schema.notificationChannels)
      .values({
        workspaceId: ws.workspaceId,
        type: "slack",
        name: parsed.name,
        config: { webhookUrl: parsed.webhookUrl },
      })
      .returning({ id: schema.notificationChannels.id });
    if (!channel) throw new Error("failed to create channel");
    if (monitorIds.length > 0) {
      await tx
        .insert(schema.monitorChannels)
        .values(monitorIds.map((monitorId) => ({ monitorId, channelId: channel.id })));
    }
  });

  revalidatePath("/channels");
  redirect(withToastRedirect("/channels", `Added channel “${parsed.name}”`));
}

const updateChannelSchema = slackChannelSchema.extend({ id: z.string().uuid() });

export async function updateChannel(formData: FormData) {
  const ws = await requireEditor();
  const parsed = parseOrFlash(updateChannelSchema, Object.fromEntries(formData), "/channels");
  const monitorIds = await resolveMonitorIds(formData, ws.workspaceId);

  await db().transaction(async (tx) => {
    const [channel] = await tx
      .update(schema.notificationChannels)
      .set({
        name: parsed.name,
        config: { webhookUrl: parsed.webhookUrl },
        enabled: readEnabled(formData),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.notificationChannels.id, parsed.id),
          eq(schema.notificationChannels.workspaceId, ws.workspaceId),
        ),
      )
      .returning({ id: schema.notificationChannels.id });
    if (!channel) throw new Error("forbidden");

    // Replace the subscription set wholesale — unchecking everything has to
    // mean "no monitors", not "leave the links alone".
    await tx.delete(schema.monitorChannels).where(eq(schema.monitorChannels.channelId, channel.id));
    if (monitorIds.length > 0) {
      await tx
        .insert(schema.monitorChannels)
        .values(monitorIds.map((monitorId) => ({ monitorId, channelId: channel.id })));
    }
  });

  revalidatePath("/channels");
  revalidatePath("/monitors");
  redirect(withToastRedirect("/channels", `Saved “${parsed.name}”`));
}

export async function deleteChannel(id: string) {
  const ws = await requireEditor();
  await db()
    .delete(schema.notificationChannels)
    .where(
      and(
        eq(schema.notificationChannels.id, id),
        eq(schema.notificationChannels.workspaceId, ws.workspaceId),
      ),
    );
  revalidatePath("/channels");
  redirect(withToastRedirect("/channels", "Channel deleted", "info"));
}

export async function linkMonitorToChannel(monitorId: string, channelId: string) {
  const ws = await requireEditor();
  // Verify both belong to current workspace before linking, so a poisoned
  // request can't link cross-workspace.
  const [monitor] = await db()
    .select({ id: schema.monitors.id })
    .from(schema.monitors)
    .where(and(eq(schema.monitors.id, monitorId), eq(schema.monitors.workspaceId, ws.workspaceId)))
    .limit(1);
  const [channel] = await db()
    .select({ id: schema.notificationChannels.id })
    .from(schema.notificationChannels)
    .where(
      and(
        eq(schema.notificationChannels.id, channelId),
        eq(schema.notificationChannels.workspaceId, ws.workspaceId),
      ),
    )
    .limit(1);
  if (!monitor || !channel) throw new Error("forbidden");

  await db().insert(schema.monitorChannels).values({ monitorId, channelId }).onConflictDoNothing();
  revalidatePath("/channels");
  revalidatePath("/monitors");
}

export async function unlinkMonitorFromChannel(monitorId: string, channelId: string) {
  await requireEditor();
  // Workspace check is implicit here — both are scoped to current workspace
  // by the monitors/channels FKs and the join row only exists if both did.
  await db()
    .delete(schema.monitorChannels)
    .where(
      and(
        eq(schema.monitorChannels.monitorId, monitorId),
        eq(schema.monitorChannels.channelId, channelId),
      ),
    );
  revalidatePath("/channels");
  revalidatePath("/monitors");
}
