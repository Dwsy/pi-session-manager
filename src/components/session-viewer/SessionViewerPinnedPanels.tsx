import type { ReactNode } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  useSortable,
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PanelRightOpen, X } from "lucide-react";
import type { PsmSessionToolbarItemRuntimeRegistration } from "@/plugins/runtime-host/types";

interface SessionFeatureItem {
  id: string;
  panelId?: string;
  title: string;
  description: string;
  active: boolean;
  onSelect: () => void;
  icon: ReactNode;
}

interface SortablePinnedPanelButtonProps {
  item: PsmSessionToolbarItemRuntimeRegistration;
  activePanelId: string | null;
  onToggle: (id: string) => void;
  onUnpin: (panelId: string) => void;
  featureToggleClass: string;
  featureToggleActiveClass: string;
  featureToggleInactiveClass: string;
}

function SortablePinnedPanelButton({
  item,
  activePanelId,
  onToggle,
  onUnpin,
  featureToggleClass,
  featureToggleActiveClass,
  featureToggleInactiveClass,
}: SortablePinnedPanelButtonProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const isActive = item.panelId ? activePanelId === item.panelId : false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="psm-session-pinned-button-wrapper group"
      data-dragging={isDragging}
    >
      <button
        type="button"
        className={`${featureToggleClass} ${isActive ? featureToggleActiveClass : featureToggleInactiveClass}`}
        onClick={() => item.panelId && onToggle(item.panelId)}
        aria-pressed={isActive}
        aria-label={item.title}
        title={item.title}
      >
        <PanelRightOpen className="h-3.5 w-3.5" />
      </button>
      {/* Unpin button - shown on hover */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (item.panelId) {
            onUnpin(item.panelId);
          }
        }}
        className="psm-session-pinned-button__unpin"
        aria-label="Unpin"
        title="Unpin"
      >
        <X className="h-2.5 w-2.5" />
      </button>
      {/* Drag handle indicator - shown on hover, handles drag */}
      <div
        className="psm-session-pinned-button__drag-indicator"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        title="Drag to reorder"
        role="button"
        tabIndex={0}
      />
    </div>
  );
}

interface SortablePinnedPanelsProps {
  items: PsmSessionToolbarItemRuntimeRegistration[];
  activePanelId: string | null;
  onToggle: (id: string) => void;
  onUnpin: (panelId: string) => void;
  onReorder: (ids: string[]) => void;
  featureToggleClass: string;
  featureToggleActiveClass: string;
  featureToggleInactiveClass: string;
}

// Memoized sensors to prevent recreating on every render
const pointerSensorConfig = {
  activationConstraint: {
    distance: 5,
  },
};

export function useSortableSensors() {
  return useSensors(
    useSensor(PointerSensor, pointerSensorConfig)
  );
}

export function SortablePinnedPanels({
  items,
  activePanelId,
  onToggle,
  onUnpin,
  onReorder,
  featureToggleClass,
  featureToggleActiveClass,
  featureToggleInactiveClass,
}: SortablePinnedPanelsProps) {
  const sensors = useSortableSensors();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      const newItems = arrayMove(items, oldIndex, newIndex);
      onReorder(newItems.map((item) => item.panelId).filter(Boolean) as string[]);
    }
  };

  if (items.length === 0) return null;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={horizontalListSortingStrategy}
      >
        {items.map((item) => (
          <SortablePinnedPanelButton
            key={item.id}
            item={item}
            activePanelId={activePanelId}
            onToggle={onToggle}
            onUnpin={onUnpin}
            featureToggleClass={featureToggleClass}
            featureToggleActiveClass={featureToggleActiveClass}
            featureToggleInactiveClass={featureToggleInactiveClass}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

export type { SessionFeatureItem, SortablePinnedPanelsProps };
