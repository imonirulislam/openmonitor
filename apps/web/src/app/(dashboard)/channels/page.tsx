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
  SectionGroupTitle,
  Separator,
} from "@openmonitor/ui";
import { TrashIcon } from "lucide-react";
import {
  createSlackChannel,
  deleteChannel,
  linkMonitorToChannel,
  unlinkMonitorFromChannel,
} from "~/lib/actions/channels";
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
      <header>
        <SectionGroupTitle>Notification channels</SectionGroupTitle>
        <p className="mt-1 text-muted-foreground text-sm">
          Slack webhooks that receive alerts when linked monitors change state.
        </p>
      </header>

      <Separator />

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
        </FormCardContent>
        <FormCardFooter>
          <FormCardFooterInfo>
            A channel receives nothing until a monitor is linked to it below.
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
              </CardHeader>
              <CardContent>
                <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  Subscribed monitors
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {monitors.map((m) => {
                    const isLinked = linked.has(m.id);
                    return (
                      <form
                        key={m.id}
                        action={async () => {
                          "use server";
                          if (isLinked) await unlinkMonitorFromChannel(m.id, c.id);
                          else await linkMonitorToChannel(m.id, c.id);
                        }}
                      >
                        <button type="submit" className="appearance-none">
                          <Badge variant={isLinked ? "success" : "outline"}>{m.name}</Badge>
                        </button>
                      </form>
                    );
                  })}
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
