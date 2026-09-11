import { db, eq, inArray, schema } from "@openmonitor/db";
import {
  Button,
  FormCard,
  FormCardContent,
  FormCardDescription,
  FormCardFooter,
  FormCardFooterInfo,
  FormCardHeader,
  FormCardTitle,
  Input,
  Label,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@openmonitor/ui";
import { ChannelsTable } from "~/components/channels-table";
import { CheckboxPicker } from "~/components/checkbox-picker";
import { createSlackChannel, deleteChannel, updateChannel } from "~/lib/actions/channels";
import { getCurrentWorkspaceId } from "~/lib/workspace";

export default async function ChannelsPage() {
  const workspaceId = await getCurrentWorkspaceId();
  const conn = db();
  const channels = await conn
    .select()
    .from(schema.notificationChannels)
    .where(eq(schema.notificationChannels.workspaceId, workspaceId));
  const monitors = await conn
    .select()
    .from(schema.monitors)
    .where(eq(schema.monitors.workspaceId, workspaceId));
  // monitorChannels has no workspace_id, but join through monitors-in-workspace
  // is sufficient to keep cross-workspace data out.
  const monitorIds = monitors.map((m) => m.id);
  const links =
    monitorIds.length > 0
      ? await conn
          .select()
          .from(schema.monitorChannels)
          .where(inArray(schema.monitorChannels.monitorId, monitorIds))
      : [];

  const linkedMap = new Map<string, Set<string>>();
  for (const l of links) {
    const set = linkedMap.get(l.channelId) ?? new Set<string>();
    set.add(l.monitorId);
    linkedMap.set(l.channelId, set);
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader>
        <SectionTitle>Notification channels</SectionTitle>
        <SectionDescription>
          Slack webhooks that receive alerts when linked monitors change state.
        </SectionDescription>
      </SectionHeader>

      <FormCard asForm action={createSlackChannel}>
        <FormCardHeader>
          <FormCardTitle>Add Slack channel</FormCardTitle>
          <FormCardDescription>
            Alerts for linked monitors are posted to this webhook.
          </FormCardDescription>
        </FormCardHeader>
        <FormCardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="#ops-alerts" />
            <p className="text-muted-foreground text-xs">Shown in the channel list.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="webhookUrl">Webhook URL</Label>
            <Input
              id="webhookUrl"
              name="webhookUrl"
              type="url"
              required
              placeholder="https://hooks.slack.com/services/..."
            />
            <p className="text-muted-foreground text-xs">
              From Slack → Incoming Webhooks. Stored as given.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Monitors</Label>
            <CheckboxPicker
              items={monitors}
              name="monitorIds"
              idPrefix="new"
              empty="No monitors in this workspace yet — create one and it can subscribe here."
              hint="Alerts go only to the monitors checked here."
            />
          </div>
        </FormCardContent>
        <FormCardFooter>
          <FormCardFooterInfo>
            Pick the monitors now — you can change them later.
          </FormCardFooterInfo>
          <Button type="submit">Add channel</Button>
        </FormCardFooter>
      </FormCard>

      <ChannelsTable
        rows={channels.map((c) => {
          const linked = linkedMap.get(c.id) ?? new Set<string>();
          return {
            id: c.id,
            name: c.name,
            type: c.type,
            enabled: c.enabled,
            webhookUrl: c.config.webhookUrl,
            monitorNames: monitors.filter((m) => linked.has(m.id)).map((m) => m.name),
            subscribed: [...linked],
          };
        })}
        monitors={monitors.map((m) => ({ id: m.id, name: m.name }))}
        updateAction={updateChannel}
        deleteAction={async (id: string) => {
          "use server";
          await deleteChannel(id);
        }}
      />
    </div>
  );
}
