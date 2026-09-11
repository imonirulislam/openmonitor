"use client";

import { Checkbox, Input, Label } from "@openmonitor/ui";
import { useMemo, useState } from "react";

export type PickerMonitor = { id: string; name: string };

const FILTER_THRESHOLD = 8;

/**
 * Monitor subscriptions for a notification channel, submitted with the form
 * rather than toggled one round-trip at a time.
 */
export function ChannelMonitorPicker({
  monitors,
  defaultSelected = [],
  idPrefix,
}: {
  monitors: PickerMonitor[];
  defaultSelected?: string[];
  idPrefix: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelected));
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? monitors.filter((m) => m.name.toLowerCase().includes(q)) : monitors;
  }, [monitors, filter]);

  const allSelected = monitors.length > 0 && selected.size === monitors.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (monitors.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No monitors in this workspace yet — create one and it can subscribe here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {monitors.length > FILTER_THRESHOLD ? (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter monitors…"
          aria-label="Filter monitors"
          className="h-8"
        />
      ) : null}

      <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1">
        <label className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(on) =>
              setSelected(on ? new Set(monitors.map((m) => m.id)) : new Set())
            }
          />
          <span className="font-medium text-sm">Select all</span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {selected.size}/{monitors.length}
          </span>
        </label>

        {visible.map((m) => (
          <label
            key={m.id}
            htmlFor={`${idPrefix}-${m.id}`}
            className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
          >
            <Checkbox
              id={`${idPrefix}-${m.id}`}
              checked={selected.has(m.id)}
              onCheckedChange={(on) => toggle(m.id, on === true)}
            />
            <span className="truncate text-sm">{m.name}</span>
          </label>
        ))}
        {visible.length === 0 ? (
          <p className="px-2 py-1.5 text-muted-foreground text-xs">No monitor matches that.</p>
        ) : null}
      </div>
      <Label className="text-muted-foreground text-xs">
        Alerts go only to the monitors checked here.
      </Label>

      {/* Carries the selection, so filtering a row out of view can't drop it. */}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="monitorIds" value={id} />
      ))}
    </div>
  );
}
