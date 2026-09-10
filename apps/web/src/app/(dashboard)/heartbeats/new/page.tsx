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
  Textarea,
} from "@openmonitor/ui";
import { createHeartbeat } from "~/lib/actions/heartbeats";

export default function NewHeartbeatPage() {
  return (
    <div className="flex flex-col gap-6">
      <FormCard asForm action={createHeartbeat}>
        <FormCardHeader>
          <FormCardTitle>New heartbeat</FormCardTitle>
          <FormCardDescription>
            We'll generate a unique URL. Your cron / job hits it on each run; we alert when the
            pings stop arriving.
          </FormCardDescription>
        </FormCardHeader>
        <FormCardContent>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              name="slug"
              required
              pattern="[a-z0-9-]+"
              minLength={2}
              maxLength={80}
              title="Lowercase letters, numbers, and dashes only"
              placeholder="nightly-rollup"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required maxLength={200} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expectedIntervalSeconds">Expected interval (seconds)</Label>
              <Input
                id="expectedIntervalSeconds"
                name="expectedIntervalSeconds"
                type="number"
                defaultValue={300}
                min={30}
                max={86400}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="graceSeconds">Grace period (seconds)</Label>
              <Input
                id="graceSeconds"
                name="graceSeconds"
                type="number"
                defaultValue={60}
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
              defaultChecked
              className="size-4 rounded border-border"
            />
            Enabled
          </label>
        </FormCardContent>
        <FormCardFooter>
          <FormCardFooterInfo>
            Sweeper trips when no ping arrives within (interval + grace) seconds.
          </FormCardFooterInfo>
          <Button type="submit">Create</Button>
        </FormCardFooter>
      </FormCard>
    </div>
  );
}
