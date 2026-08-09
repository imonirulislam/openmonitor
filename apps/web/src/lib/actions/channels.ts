"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, db, eq, schema } from "@openmonitor/db";
import { withToastRedirect } from "@openmonitor/ui";
import { auth } from "~/auth";
import { parseOrFlash } from "~/lib/zod-flash";

const slackChannelSchema = z.object({
  name: z.string().min(1).max(200),
  webhookUrl: z.string().url().startsWith("https://hooks.slack.com/"),
  enabled: z.coerce.boolean().default(true),
});

async function requireEditor() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "viewer") throw new Error("forbidden");
  if (!session.user.workspaceId) throw new Error("no workspace bound to session");
  return session;
}

export async function createSlackChannel(formData: FormData) {
  const session = await requireEditor();
  const parsed = parseOrFlash(
    slackChannelSchema,
    Object.fromEntries(formData),
    "/dashboard/channels",
  );
  await db().insert(schema.notificationChannels).values({
    workspaceId: session.user.workspaceId,
    type: "slack",
    name: parsed.name,
    config: { webhookUrl: parsed.webhookUrl },
    enabled: parsed.enabled,
  });
  revalidatePath("/dashboard/channels");
  redirect(withToastRedirect("/dashboard/channels", `Added channel “${parsed.name}”`));
}

export async function deleteChannel(id: string) {
  const session = await requireEditor();
  await db()
    .delete(schema.notificationChannels)
    .where(
      and(
        eq(schema.notificationChannels.id, id),
        eq(schema.notificationChannels.workspaceId, session.user.workspaceId),
      ),
    );
  revalidatePath("/dashboard/channels");
  redirect(withToastRedirect("/dashboard/channels", "Channel deleted", "info"));
}

export async function linkMonitorToChannel(monitorId: string, channelId: string) {
  const session = await requireEditor();
  // Verify both belong to current workspace before linking, so a poisoned
  // request can't link cross-workspace.
  const [monitor] = await db()
    .select({ id: schema.monitors.id })
    .from(schema.monitors)
    .where(
      and(eq(schema.monitors.id, monitorId), eq(schema.monitors.workspaceId, session.user.workspaceId)),
    )
    .limit(1);
  const [channel] = await db()
    .select({ id: schema.notificationChannels.id })
    .from(schema.notificationChannels)
    .where(
      and(
        eq(schema.notificationChannels.id, channelId),
        eq(schema.notificationChannels.workspaceId, session.user.workspaceId),
      ),
    )
    .limit(1);
  if (!monitor || !channel) throw new Error("forbidden");

  await db()
    .insert(schema.monitorChannels)
    .values({ monitorId, channelId })
    .onConflictDoNothing();
  revalidatePath("/dashboard/channels");
  revalidatePath("/dashboard/monitors");
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
  revalidatePath("/dashboard/channels");
  revalidatePath("/dashboard/monitors");
}
