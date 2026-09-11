"use client";

import { Checkbox, Input, Label } from "@openmonitor/ui";
import { useMemo, useState } from "react";

export type PickerItem = { id: string; name: string };

const FILTER_THRESHOLD = 8;

/**
 * Checkbox list submitted as repeated `name` values, so a set of links is one
 * save rather than a round-trip per row.
 */
export function CheckboxPicker({
  items,
  name,
  defaultSelected = [],
  idPrefix,
  empty,
  hint,
}: {
  items: PickerItem[];
  name: string;
  defaultSelected?: string[];
  idPrefix: string;
  empty: string;
  hint: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelected));
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? items.filter((m) => m.name.toLowerCase().includes(q)) : items;
  }, [items, filter]);

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (items.length === 0) {
    return <p className="text-muted-foreground text-xs">{empty}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length > FILTER_THRESHOLD ? (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          aria-label="Filter"
          className="h-8"
        />
      ) : null}

      <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1">
        <label className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent">
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(on) => setSelected(on ? new Set(items.map((m) => m.id)) : new Set())}
          />
          <span className="font-medium text-sm">Select all</span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {selected.size}/{items.length}
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
          <p className="px-2 py-1.5 text-muted-foreground text-xs">Nothing matches that.</p>
        ) : null}
      </div>
      <Label className="text-muted-foreground text-xs">{hint}</Label>

      {/* Carries the selection, so filtering a row out of view can't drop it. */}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
