"use client";

import {
  Button,
  Input,
  Label,
  Select,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Textarea,
} from "@openmonitor/ui";
import { PlusIcon } from "lucide-react";
import { MonitorMultiSelect } from "./monitor-multi-select";

/**
 * Slide-in panel for creating an incident (a.k.a. "Status Report" in
 * openstatus parlance). Posts to the existing `createIncident` server action
 * with monitor selection scoped to the affected components.
 */
export function IncidentSheet({
  action,
  statusPageId,
  triggerLabel = "Create Status Report",
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
          <SheetTitle>New status report</SheetTitle>
          <SheetDescription>
            Open a report for an incident affecting components on this page.
          </SheetDescription>
        </SheetHeader>

        <form action={action} className="flex flex-col gap-3 overflow-y-auto pb-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required maxLength={300} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="severity">Severity</Label>
              <Select id="severity" name="severity" defaultValue="minor">
                <option value="minor">Minor</option>
                <option value="major">Major</option>
                <option value="critical">Critical</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue="investigating">
                <option value="investigating">Investigating</option>
                <option value="identified">Identified</option>
                <option value="monitoring">Monitoring</option>
                <option value="resolved">Resolved</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="message">
              Initial update <span className="font-normal text-muted-foreground">(markdown)</span>
            </Label>
            <Textarea id="message" name="message" rows={4} required maxLength={5000} />
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="font-medium text-sm">Affected components</legend>
            <MonitorMultiSelect
              name="monitorIds"
              statusPageId={statusPageId}
              emptyText="This page has no components yet. Add some on the Components tab first."
            />
          </fieldset>

          <Button type="submit" className="mt-2">
            Submit
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
