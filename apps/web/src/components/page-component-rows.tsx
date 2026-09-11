"use client";

import { Button, Card, cn, Input, Select } from "@openmonitor/ui";
import { Link2Icon, Link2OffIcon, Trash2Icon } from "lucide-react";
import { AddComponentMenu } from "./page-component-add-menu";
import {
  type ComponentDraft,
  type GroupDraft,
  type Monitor,
  STATUS_DOT,
} from "./page-components-tree";
import { Sortable, SortableItem, SortableItemHandle } from "./sortable";

/**
 * Single row inside the components list. Mirrors openstatus's ComponentRow:
 * drag handle | name input | description input | type indicator | status dot |
 * trash. Type is fixed at create time; the indicator just reflects it.
 */
export function ComponentRow({
  component,
  onChange,
  onDelete,
}: {
  component: ComponentDraft;
  onChange: (patch: Partial<ComponentDraft>) => void;
  onDelete: () => void;
}) {
  const isStatic = component.type === "static";
  const dotClass = component.monitorStatus
    ? STATUS_DOT[component.monitorStatus]
    : isStatic && component.staticStatus
      ? STATUS_DOT[component.staticStatus]
      : "bg-muted-foreground/40";

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
      <SortableItemHandle />
      <Input
        value={component.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="Name"
        className="h-8 flex-1"
        required
        maxLength={200}
      />
      <Input
        value={component.description ?? ""}
        onChange={(e) => onChange({ description: e.target.value || null })}
        placeholder="Description"
        className="h-8 flex-1"
        maxLength={2000}
      />
      <div className="flex w-44 shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
        {isStatic ? (
          <>
            <Link2OffIcon className="size-3.5" />
            <span className="truncate">Static Component</span>
          </>
        ) : (
          <>
            <Link2Icon className="size-3.5" />
            <span className="truncate">{component.monitorName ?? "—"}</span>
          </>
        )}
      </div>
      {isStatic ? null : (
        <Select
          value={component.surface}
          onChange={(e) => onChange({ surface: e.target.value as ComponentDraft["surface"] })}
          aria-label="Where it shows"
          className="h-8 w-36 shrink-0 text-xs"
        >
          <option value="status">Status only</option>
          <option value="metrics">Metrics only</option>
          <option value="both">Status + metrics</option>
        </Select>
      )}
      <span
        aria-label={`status ${component.monitorStatus ?? component.staticStatus ?? "unknown"}`}
        className={cn("size-2 shrink-0 rounded-full", dotClass)}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 text-destructive"
        aria-label="Delete component"
        onClick={onDelete}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );
}

/**
 * Group container. Header row mirrors openstatus's: drag handle, group-name
 * input, "+ Add Component" dropdown that adds INTO this group, "Open by
 * default" checkbox, trash. Body is its own Sortable list of components.
 *
 * Cross-container drag (group ↔ ungrouped, group A ↔ group B) is NOT
 * implemented — same as upstream. To move a component out of a group,
 * delete it and re-add at the new spot.
 */
export function GroupRow({
  group,
  components,
  monitors,
  usedMonitorIds,
  onChange,
  onDelete,
  onAddStatic,
  onAddMonitor,
  onComponentChange,
  onComponentDelete,
  onReorder,
}: {
  group: GroupDraft;
  components: ComponentDraft[];
  monitors: Monitor[];
  usedMonitorIds: Set<string>;
  onChange: (patch: Partial<GroupDraft>) => void;
  onDelete: () => void;
  onAddStatic: () => void;
  onAddMonitor: (m: Monitor) => void;
  onComponentChange: (componentKey: string, patch: Partial<ComponentDraft>) => void;
  onComponentDelete: (componentKey: string) => void;
  onReorder: (nextKeys: string[]) => void;
}) {
  return (
    <Card className="overflow-hidden bg-muted/30">
      <header className="flex items-center gap-2 border-b border-border p-2">
        <SortableItemHandle />
        <Input
          value={group.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Group name"
          className="h-8 flex-1"
          required
          maxLength={200}
        />
        <AddComponentMenu
          monitors={monitors}
          usedMonitorIds={usedMonitorIds}
          onStatic={onAddStatic}
          onMonitor={onAddMonitor}
          variant="ghost"
        />
        <label className="flex items-center gap-1.5 px-2 text-muted-foreground text-xs">
          <input
            type="checkbox"
            checked={group.defaultOpen}
            onChange={(e) => onChange({ defaultOpen: e.target.checked })}
            className="size-3.5 rounded border-border"
          />
          Open by default
        </label>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 text-destructive"
          aria-label="Delete group"
          onClick={onDelete}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </header>
      <div className="flex flex-col gap-2 p-2">
        {components.length === 0 ? (
          <p className="px-2 py-3 text-center text-muted-foreground text-sm">
            No components selected
          </p>
        ) : null}
        <Sortable ids={components.map((c) => c.uiKey)} onChange={onReorder}>
          <div className="flex flex-col gap-2">
            {components.map((c) => (
              <SortableItem key={c.uiKey} id={c.uiKey}>
                <ComponentRow
                  component={c}
                  onChange={(patch) => onComponentChange(c.uiKey, patch)}
                  onDelete={() => onComponentDelete(c.uiKey)}
                />
              </SortableItem>
            ))}
          </div>
        </Sortable>
      </div>
    </Card>
  );
}
