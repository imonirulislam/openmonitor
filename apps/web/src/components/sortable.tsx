"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@openmonitor/ui";
import { GripVerticalIcon } from "lucide-react";
import { type CSSProperties, createContext, type ReactNode, useContext, useMemo } from "react";

/**
 * Thin wrapper around @dnd-kit/sortable. Pass a stable id list and an onChange
 * that re-orders the parent's state. Items inside should be `<SortableItem>`s
 * with a `<SortableItemHandle>` somewhere inside them — only the handle
 * accepts a drag; clicks elsewhere on the row keep working as buttons.
 */
export function Sortable<T extends string>({
  ids,
  onChange,
  children,
}: {
  ids: T[];
  onChange: (next: T[]) => void;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id as T);
    const newIndex = ids.indexOf(over.id as T);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

type SortableItemContext = ReturnType<typeof useSortable>;
const SortableItemCtx = createContext<SortableItemContext | null>(null);

/**
 * Single sortable child. Renders into whatever element the caller wraps
 * around `children`; we just provide the dnd ref/transform via context so
 * `<SortableItemHandle>` can wire its listeners on the drag handle alone.
 */
export function SortableItem({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const sortable = useSortable({ id });
  const style: CSSProperties = useMemo(
    () => ({
      transform: CSS.Translate.toString(sortable.transform),
      transition: sortable.transition,
      opacity: sortable.isDragging ? 0.5 : undefined,
    }),
    [sortable.transform, sortable.transition, sortable.isDragging],
  );
  return (
    <SortableItemCtx.Provider value={sortable}>
      <div ref={sortable.setNodeRef} style={style} className={className}>
        {children}
      </div>
    </SortableItemCtx.Provider>
  );
}

/**
 * The grab affordance. Place inside a `<SortableItem>`. Renders a
 * `GripVertical` icon with the dnd listeners attached — only this icon
 * starts a drag, so the row's other inputs and buttons keep working.
 */
export function SortableItemHandle({ className }: { className?: string }) {
  const ctx = useContext(SortableItemCtx);
  if (!ctx) throw new Error("SortableItemHandle must be inside SortableItem");
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing",
        className,
      )}
      aria-label="Drag handle"
      {...ctx.attributes}
      {...ctx.listeners}
    >
      <GripVerticalIcon className="size-4" />
    </button>
  );
}
