import { and, db, eq, schema } from "@openmonitor/db";
import {
  Badge,
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
  LocalTime,
  Textarea,
} from "@openmonitor/ui";
import { notFound } from "next/navigation";
import { CopyButton } from "~/components/copy-button";
import { deleteHeartbeat, rotateHeartbeatToken, updateHeartbeat } from "~/lib/actions/heartbeats";
import { getCurrentWorkspaceId } from "~/lib/workspace";

export default async function HeartbeatEdit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspaceId = await getCurrentWorkspaceId();
  const [hb] = await db()
    .select()
    .from(schema.heartbeatMonitors)
    .where(
      and(
        eq(schema.heartbeatMonitors.id, id),
        eq(schema.heartbeatMonitors.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!hb) notFound();

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5002";
  const pingUrl = `${apiBaseUrl}/v1/heartbeats/${hb.token}`;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-xl tracking-tight">{hb.name}</h1>
          <p className="mt-1 font-mono text-muted-foreground text-xs">{hb.slug}</p>
        </div>
        <Badge
          variant={
            hb.currentStatus === "up"
              ? "success"
              : hb.currentStatus === "down"
                ? "destructive"
                : "default"
          }
        >
          {hb.currentStatus}
        </Badge>
      </header>

      <FormCard>
        <FormCardHeader>
          <FormCardTitle>Ping URL</FormCardTitle>
          <FormCardDescription>
            curl this URL on your job's normal schedule. Treat the token like a secret.
          </FormCardDescription>
        </FormCardHeader>
        <FormCardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-border bg-muted/30 px-3 py-2 font-mono text-xs">
              {pingUrl}
            </code>
            <CopyButton value={pingUrl} />
          </div>
          <p className="font-mono text-muted-foreground text-xs">
            Last ping:{" "}
            {hb.lastPingAt ? (
              <LocalTime date={hb.lastPingAt.toISOString()} format="LLL d, HH:mm:ss" />
            ) : (
              "never"
            )}
          </p>
        </FormCardContent>
        <FormCardFooter>
          <FormCardFooterInfo>Rotating invalidates the old URL immediately.</FormCardFooterInfo>
          <form action={rotateHeartbeatToken.bind(null, id)}>
            <Button type="submit" variant="outline">
              Rotate token
            </Button>
          </form>
        </FormCardFooter>
      </FormCard>

      <FormCard asForm action={updateHeartbeat.bind(null, id)}>
        <FormCardHeader>
          <FormCardTitle>Settings</FormCardTitle>
        </FormCardHeader>
        <FormCardContent>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={hb.slug}
              required
              pattern="[a-z0-9-]+"
              minLength={2}
              maxLength={80}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={hb.name} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={hb.description ?? ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expectedIntervalSeconds">Expected interval (s)</Label>
              <Input
                id="expectedIntervalSeconds"
                name="expectedIntervalSeconds"
                type="number"
                defaultValue={hb.expectedIntervalSeconds}
                min={30}
                max={86400}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="graceSeconds">Grace (s)</Label>
              <Input
                id="graceSeconds"
                name="graceSeconds"
                type="number"
                defaultValue={hb.graceSeconds}
                min={0}
                max={3600}
                required
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              value="true"
              defaultChecked={hb.enabled}
              className="size-4 rounded border-border"
            />
            Enabled
          </label>
        </FormCardContent>
        <FormCardFooter>
          <FormCardFooterInfo>
            Saved settings take effect on the next sweep tick.
          </FormCardFooterInfo>
          <Button type="submit">Save</Button>
        </FormCardFooter>
      </FormCard>

      <FormCard className="border-destructive/30">
        <FormCardHeader>
          <FormCardTitle className="text-destructive">Danger zone</FormCardTitle>
          <FormCardDescription>Permanently delete this heartbeat.</FormCardDescription>
        </FormCardHeader>
        <FormCardFooter className="bg-destructive/5">
          <FormCardFooterInfo>This action cannot be undone.</FormCardFooterInfo>
          <form action={deleteHeartbeat.bind(null, id)}>
            <Button variant="destructive" type="submit">
              Delete heartbeat
            </Button>
          </form>
        </FormCardFooter>
      </FormCard>
    </div>
  );
}
