"use client";

import { PlusIcon } from "lucide-react";
import {
  Button,
  DateTimeLocalInput,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Textarea,
} from "@openmonitor/ui";
import { MonitorMultiSelect } from "./monitor-multi-select";

/**
 * Slide-in panel for creating a maintenance window. The form posts to the
 * existing `createMaintenance` server action — the only behavioral difference
 * from the standalone page is the chrome.
 */
export function MaintenanceSheet({
  action,
  statusPageId,
  triggerLabel = "Create Maintenance",
}: {
  action: (formData: FormData) => void | Promise<void>;
  statusPageId?: string;
  triggerLabel?: string;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm">
          <PlusIcon /> {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>New maintenance</SheetTitle>
          <SheetDescription>
            Configure a planned outage window. Saved on submit.
          </SheetDescription>
        </SheetHeader>

        <form action={action} className="flex flex-col gap-3 overflow-y-auto pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required placeholder="DB migration…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Message</Label>
            <Textarea id="description" name="description" rows={3} placeholder="Markdown supported" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startsAt">Starts at</Label>
              <DateTimeLocalInput id="startsAt" name="startsAt" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endsAt">Ends at</Label>
              <DateTimeLocalInput id="endsAt" name="endsAt" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recurrenceRule">
                Recurrence{" "}
                <span className="font-normal text-muted-foreground">(RRULE)</span>
              </Label>
              <Input
                id="recurrenceRule"
                name="recurrenceRule"
                placeholder="FREQ=WEEKLY;BYDAY=TU"
                className="font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recurrenceUntil">Repeat until</Label>
              <DateTimeLocalInput id="recurrenceUntil" name="recurrenceUntil" />
            </div>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="font-medium text-sm">Page Components</legend>
            <p className="text-muted-foreground text-xs">
              Connected page components will be affected for the period of time.
            </p>
            <div className="mt-1">
              <MonitorMultiSelect
                name="monitorIds"
                statusPageId={statusPageId}
                emptyText="No monitors are linked to this page yet."
              />
            </div>
          </fieldset>
          <Button type="submit" className="mt-2">
            Submit
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
