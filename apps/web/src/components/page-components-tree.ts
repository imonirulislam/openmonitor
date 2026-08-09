/**
 * Pure tree types + (de)serialization helpers for the components editor.
 * No React, no JSX — just shape conversions between server payloads, the
 * client form state, and the JSON we POST back via `updatePageComponentsTree`.
 */

export type Monitor = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  currentStatus: "up" | "down" | "degraded" | "unknown";
};

export type ComponentDraft = {
  /** Stable key for React + dnd-kit. Never sent to server. */
  uiKey: string;
  /** db id when loaded from server; absent for newly-added rows. */
  id?: string;
  type: "monitor" | "static";
  monitorId: string | null;
  monitorName: string | null;
  monitorSlug: string | null;
  monitorStatus: "up" | "down" | "degraded" | "unknown" | null;
  name: string;
  description: string | null;
  staticStatus: "up" | "down" | "degraded" | "unknown" | null;
};

export type GroupDraft = {
  uiKey: string;
  id?: string;
  /** Stable client handle for FKs from components, lives across saves. */
  clientGroupId: string;
  name: string;
  defaultOpen: boolean;
  /** ordered uiKeys of children */
  componentKeys: string[];
};

export type LoadedComponent = {
  id: string;
  type: "monitor" | "static";
  monitorId: string | null;
  monitorName: string | null;
  monitorSlug: string | null;
  monitorStatus: "up" | "down" | "degraded" | "unknown" | null;
  name: string;
  description: string | null;
  staticStatus: "up" | "down" | "degraded" | "unknown" | null;
  groupId: string | null;
  position: number;
  groupPosition: number;
};

export type LoadedGroup = {
  id: string;
  name: string;
  defaultOpen: boolean;
  position: number;
};

let _idCounter = 0;
export function newKey(prefix: string): string {
  _idCounter += 1;
  return `${prefix}-${Date.now()}-${_idCounter}`;
}

export const STATUS_DOT: Record<NonNullable<ComponentDraft["monitorStatus"]>, string> = {
  up: "bg-success",
  down: "bg-destructive",
  degraded: "bg-warning",
  unknown: "bg-muted-foreground/40",
};

const compKey = (id: string) => `db:c:${id}`;
const groupKey = (id: string) => `db:g:${id}`;

export type InitialState = {
  componentsByKey: Record<string, ComponentDraft>;
  groupsByKey: Record<string, GroupDraft>;
  ungroupedKeys: string[];
  groupKeys: string[];
};

export function buildInitialState(loaded: LoadedComponent[], groups: LoadedGroup[]): InitialState {
  const componentsByKey: Record<string, ComponentDraft> = {};
  const groupsByKey: Record<string, GroupDraft> = {};

  for (const c of loaded) {
    const key = compKey(c.id);
    componentsByKey[key] = {
      uiKey: key,
      id: c.id,
      type: c.type,
      monitorId: c.monitorId,
      monitorName: c.monitorName,
      monitorSlug: c.monitorSlug,
      monitorStatus: c.monitorStatus,
      name: c.name,
      description: c.description,
      staticStatus: c.staticStatus,
    };
  }

  const sortedGroups = [...groups].sort((a, b) => a.position - b.position);
  for (const g of sortedGroups) {
    const key = groupKey(g.id);
    groupsByKey[key] = {
      uiKey: key,
      id: g.id,
      clientGroupId: `existing:${g.id}`,
      name: g.name,
      defaultOpen: g.defaultOpen,
      componentKeys: [],
    };
  }

  const ungroupedKeys: string[] = [];
  const sortedComponents = [...loaded].sort((a, b) => a.position - b.position);
  const groupComponents = new Map<string, LoadedComponent[]>();
  for (const c of sortedComponents) {
    if (c.groupId) {
      const list = groupComponents.get(c.groupId) ?? [];
      list.push(c);
      groupComponents.set(c.groupId, list);
    } else {
      ungroupedKeys.push(compKey(c.id));
    }
  }
  for (const g of sortedGroups) {
    const inGroup = (groupComponents.get(g.id) ?? []).sort(
      (a, b) => a.groupPosition - b.groupPosition,
    );
    groupsByKey[groupKey(g.id)]!.componentKeys = inGroup.map((c) => compKey(c.id));
  }

  return {
    componentsByKey,
    groupsByKey,
    ungroupedKeys,
    groupKeys: sortedGroups.map((g) => groupKey(g.id)),
  };
}

export function serializeComponent(c: ComponentDraft) {
  return {
    id: c.id,
    type: c.type,
    monitorId: c.type === "monitor" ? c.monitorId : null,
    name: c.name,
    description: c.description,
    staticStatus: c.type === "static" ? c.staticStatus : null,
  };
}
