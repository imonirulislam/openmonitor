import { db, eq, inArray, schema } from "@openmonitor/db";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { TrashIcon } from "lucide-react";
import { ChannelMonitorPicker } from "~/components/channel-monitor-picker";
import { ChannelSheet } from "~/components/channel-sheet";
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
            <ChannelMonitorPicker monitors={monitors} idPrefix="new" />
          </div>
        </FormCardContent>
        <FormCardFooter>
          <FormCardFooterInfo>
            Pick the monitors now — you can change them later.
          </FormCardFooterInfo>
          <Button type="submit">Add channel</Button>
        </FormCardFooter>
      </FormCard>

      <div className="flex flex-col gap-3">
        {channels.map((c) => {
          const linked = linkedMap.get(c.id) ?? new Set<string>();
          return (
            <Card key={c.id}>
              <CardHeader className="flex-row items-start justify-between gap-4 pb-3">
                <div>
                  <CardTitle>{c.name}</CardTitle>
                  <p className="mt-0.5 font-mono text-muted-foreground text-xs">
                    {c.type} · {c.enabled ? "enabled" : "disabled"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <ChannelSheet
                    action={updateChannel}
                    channel={{
                      id: c.id,
                      name: c.name,
                      webhookUrl: c.config.webhookUrl,
                      enabled: c.enabled,
                    }}
                    monitors={monitors.map((m) => ({ id: m.id, name: m.name }))}
                    subscribed={[...linked]}
                  />
                  <form
                    action={async () => {
                      "use server";
                      await deleteChannel(c.id);
                    }}
                  >
                    <Button variant="ghost" size="icon" type="submit" aria-label="Delete">
                      <TrashIcon />
                    </Button>
                  </form>
                </div>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
                  Subscribed monitors · {linked.size} of {monitors.length}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {monitors
                    .filter((m) => linked.has(m.id))
                    .map((m) => (
                      <Badge key={m.id} variant="outline">
                        {m.name}
                      </Badge>
                    ))}
                  {linked.size === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No monitors subscribed — this channel posts nothing.
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {channels.length === 0 ? (
          <p className="text-muted-foreground text-sm">No channels yet. Add one above.</p>
        ) : null}
      </div>
    </div>
  );
}
