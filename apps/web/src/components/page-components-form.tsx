"use client";

import {
  Button,
  Card,
  FormCard,
  FormCardContent,
  FormCardDescription,
  FormCardFooter,
  FormCardFooterInfo,
  FormCardHeader,
  FormCardTitle,
} from "@openmonitor/ui";
import { PlusIcon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { AddComponentMenu } from "./page-component-add-menu";
import { ComponentRow, GroupRow } from "./page-component-rows";
import {
  buildInitialState,
  type ComponentDraft,
  type GroupDraft,
  type LoadedComponent,
  type LoadedGroup,
  type Monitor,
  newKey,
  serializeComponent,
} from "./page-components-tree";
import { Sortable, SortableItem } from "./sortable";

export type { LoadedComponent, LoadedGroup } from "./page-components-tree";

/**
 * Single-form components editor mirroring openstatus's `/components` tab:
 * top-level Sortable mixes ungrouped components + groups; each group has its
 * own inner Sortable. Submit posts the entire tree to
 * `updatePageComponentsTree`.
 *
 * Cross-container drags (group ↔ ungrouped, group A ↔ group B) are NOT
 * implemented here either — same as upstream.
 */
export function PageComponentsForm({
  pageId,
  initialComponents,
  initialGroups,
  monitors,
  action,
}: {
  pageId: string;
  initialComponents: LoadedComponent[];
  initialGroups: LoadedGroup[];
  monitors: Monitor[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const initial = useMemo(
    () => buildInitialState(initialComponents, initialGroups),
    [initialComponents, initialGroups],
  );
  const [componentsByKey, setComponentsByKey] = useState(initial.componentsByKey);
  const [ungroupedKeys, setUngroupedKeys] = useState(initial.ungroupedKeys);
  const [groupsByKey, setGroupsByKey] = useState(initial.groupsByKey);
  const [groupKeys, setGroupKeys] = useState(initial.groupKeys);

  // Top-level sortable mixes ungrouped components + groups in one list.
  const topLevelKeys = [...ungroupedKeys, ...groupKeys];
  const usedMonitorIds = new Set(
    Object.values(componentsByKey)
      .map((c) => c.monitorId)
      .filter((id): id is string => id !== null),
  );

  function moveTopLevel(next: string[]) {
    const u: string[] = [];
    const g: string[] = [];
    for (const k of next) {
      if (componentsByKey[k]) u.push(k);
      else if (groupsByKey[k]) g.push(k);
    }
    setUngroupedKeys(u);
    setGroupKeys(g);
  }

  function moveWithinGroup(groupKey: string, next: string[]) {
    setGroupsByKey((prev) => ({
      ...prev,
      [groupKey]: { ...prev[groupKey]!, componentKeys: next },
    }));
  }

  function makeStaticDraft(): ComponentDraft {
    return {
      uiKey: newKey("c"),
      type: "static",
      monitorId: null,
      monitorName: null,
      monitorSlug: null,
      monitorStatus: null,
      name: "",
      description: null,
      staticStatus: "up",
      surface: "status",
    };
  }

  function makeMonitorDraft(m: Monitor): ComponentDraft {
    return {
      uiKey: newKey("c"),
      type: "monitor",
      monitorId: m.id,
      monitorName: m.name,
      monitorSlug: m.slug,
      monitorStatus: m.currentStatus,
      name: m.name,
      description: m.description,
      staticStatus: null,
      surface: "status",
    };
  }

  function addStaticUngrouped() {
    const c = makeStaticDraft();
    setComponentsByKey((prev) => ({ ...prev, [c.uiKey]: c }));
    setUngroupedKeys((prev) => [...prev, c.uiKey]);
  }

  function addMonitorUngrouped(m: Monitor) {
    const c = makeMonitorDraft(m);
    setComponentsByKey((prev) => ({ ...prev, [c.uiKey]: c }));
    setUngroupedKeys((prev) => [...prev, c.uiKey]);
  }

  function addStaticToGroup(groupKey: string) {
    const c = makeStaticDraft();
    setComponentsByKey((prev) => ({ ...prev, [c.uiKey]: c }));
    setGroupsByKey((prev) => ({
      ...prev,
      [groupKey]: {
        ...prev[groupKey]!,
        componentKeys: [...prev[groupKey]!.componentKeys, c.uiKey],
      },
    }));
  }

  function addMonitorToGroup(groupKey: string, m: Monitor) {
    const c = makeMonitorDraft(m);
    setComponentsByKey((prev) => ({ ...prev, [c.uiKey]: c }));
    setGroupsByKey((prev) => ({
      ...prev,
      [groupKey]: {
        ...prev[groupKey]!,
        componentKeys: [...prev[groupKey]!.componentKeys, c.uiKey],
      },
    }));
  }

  function addGroup() {
    const draft: GroupDraft = {
      uiKey: newKey("g"),
      clientGroupId: newKey("cg"),
      name: "",
      defaultOpen: true,
      componentKeys: [],
    };
    setGroupsByKey((prev) => ({ ...prev, [draft.uiKey]: draft }));
    setGroupKeys((prev) => [...prev, draft.uiKey]);
  }

  function deleteComponent(key: string) {
    setComponentsByKey((prev) => {
      const { [key]: _drop, ...rest } = prev;
      return rest;
    });
    setUngroupedKeys((prev) => prev.filter((k) => k !== key));
    setGroupsByKey((prev) => {
      const next = { ...prev };
      for (const gk of Object.keys(next)) {
        next[gk] = {
          ...next[gk]!,
          componentKeys: next[gk]!.componentKeys.filter((k) => k !== key),
        };
      }
      return next;
    });
  }

  function deleteGroup(key: string) {
    // Children become ungrouped, appended at the end (matches the old action's
    // ON DELETE SET NULL behavior on the server side).
    const orphans = groupsByKey[key]?.componentKeys ?? [];
    setGroupsByKey((prev) => {
      const { [key]: _drop, ...rest } = prev;
      return rest;
    });
    setGroupKeys((prev) => prev.filter((k) => k !== key));
    setUngroupedKeys((prev) => [...prev, ...orphans]);
  }

  function updateComponent(key: string, patch: Partial<ComponentDraft>) {
    setComponentsByKey((prev) => ({ ...prev, [key]: { ...prev[key]!, ...patch } }));
  }

  function updateGroup(key: string, patch: Partial<GroupDraft>) {
    setGroupsByKey((prev) => ({ ...prev, [key]: { ...prev[key]!, ...patch } }));
  }

  function handleSubmit(formData: FormData) {
    const tree = {
      ungrouped: ungroupedKeys.map((k) => serializeComponent(componentsByKey[k]!)),
      groups: groupKeys.map((gk) => {
        const g = groupsByKey[gk]!;
        return {
          id: g.id,
          clientGroupId: g.clientGroupId,
          name: g.name,
          defaultOpen: g.defaultOpen,
          components: g.componentKeys.map((k) => serializeComponent(componentsByKey[k]!)),
        };
      }),
    };
    formData.set("tree", JSON.stringify(tree));
    startTransition(() => action(formData));
  }

  return (
    <FormCard asForm action={handleSubmit}>
      <FormCardHeader>
        <FormCardTitle>Components</FormCardTitle>
        <FormCardDescription>Manage your page components</FormCardDescription>
      </FormCardHeader>
      <FormCardContent>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={addGroup}>
            <PlusIcon /> Add Component Group
          </Button>
          <AddComponentMenu
            monitors={monitors}
            usedMonitorIds={usedMonitorIds}
            onStatic={addStaticUngrouped}
            onMonitor={addMonitorUngrouped}
          />
        </div>

        <Sortable ids={topLevelKeys} onChange={moveTopLevel}>
          <div className="flex flex-col gap-3">
            {topLevelKeys.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground text-sm">
                No components selected
              </Card>
            ) : null}
            {topLevelKeys.map((k) => {
              if (componentsByKey[k]) {
                return (
                  <SortableItem key={k} id={k}>
                    <ComponentRow
                      component={componentsByKey[k]!}
                      onChange={(patch) => updateComponent(k, patch)}
                      onDelete={() => deleteComponent(k)}
                    />
                  </SortableItem>
                );
              }
              const group = groupsByKey[k];
              if (!group) return null;
              return (
                <SortableItem key={k} id={k}>
                  <GroupRow
                    group={group}
                    components={group.componentKeys
                      .map((ck) => componentsByKey[ck])
                      .filter((c): c is ComponentDraft => Boolean(c))}
                    monitors={monitors}
                    usedMonitorIds={usedMonitorIds}
                    onChange={(patch) => updateGroup(k, patch)}
                    onDelete={() => deleteGroup(k)}
                    onAddStatic={() => addStaticToGroup(k)}
                    onAddMonitor={(m) => addMonitorToGroup(k, m)}
                    onComponentChange={(ck, patch) => updateComponent(ck, patch)}
                    onComponentDelete={(ck) => deleteComponent(ck)}
                    onReorder={(next) => moveWithinGroup(k, next)}
                  />
                </SortableItem>
              );
            })}
          </div>
        </Sortable>
      </FormCardContent>
      <FormCardFooter>
        <FormCardFooterInfo>Learn more about page components.</FormCardFooterInfo>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Submit"}
        </Button>
      </FormCardFooter>
      <input type="hidden" name="pageId" value={pageId} />
    </FormCard>
  );
}
