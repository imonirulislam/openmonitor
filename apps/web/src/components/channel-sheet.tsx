"use client";

import {
  Button,
  Checkbox,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@openmonitor/ui";
import { SettingsIcon } from "lucide-react";
import { useState } from "react";
import { CheckboxPicker, type PickerItem } from "./checkbox-picker";

/** Edit a channel and its monitor subscriptions in one save. */
export function ChannelSheet({
  action,
  channel,
  monitors,
  subscribed,
}: {
  action: (formData: FormData) => void | Promise<void>;
  channel: { id: string; name: string; webhookUrl: string; enabled: boolean };
  monitors: PickerItem[];
  subscribed: string[];
}) {
  const [enabled, setEnabled] = useState(channel.enabled);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit ${channel.name}`}>
          <SettingsIcon />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit channel</SheetTitle>
          <SheetDescription>
            Name, webhook, and which monitors post to it. Saving replaces the subscription list.
          </SheetDescription>
        </SheetHeader>

        <form action={action} className="flex flex-col gap-4 overflow-y-auto pb-4">
          <input type="hidden" name="id" value={channel.id} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`name-${channel.id}`}>Name</Label>
            <Input
              id={`name-${channel.id}`}
              name="name"
              defaultValue={channel.name}
              required
              maxLength={200}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`webhook-${channel.id}`}>Webhook URL</Label>
            <Input
              id={`webhook-${channel.id}`}
              name="webhookUrl"
              type="url"
              defaultValue={channel.webhookUrl}
              required
            />
          </div>

          <label className="flex items-center gap-2">
            <Checkbox checked={enabled} onCheckedChange={(on) => setEnabled(on === true)} />
            <span className="text-sm">Enabled</span>
            <input type="hidden" name="enabled" value={enabled ? "true" : "false"} />
          </label>

          <div className="flex flex-col gap-1.5">
            <Label>Monitors</Label>
            <CheckboxPicker
              items={monitors}
              name="monitorIds"
              defaultSelected={subscribed}
              idPrefix={`edit-${channel.id}`}
              empty="No monitors in this workspace yet."
              hint="Alerts go only to the monitors checked here."
            />
          </div>

          <Button type="submit" className="mt-1">
            Save channel
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
