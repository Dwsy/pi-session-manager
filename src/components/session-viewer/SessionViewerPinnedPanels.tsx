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
import { GripHorizontal, X } from "lucide-react";
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
  onUnpin: (panelId: string) => void;
  renderItem: (item: PsmSessionToolbarItemRuntimeRegistration) => ReactNode;
  unpinLabel: string;
  dragLabel: string;
}

function SortablePinnedPanelButton({
  item,
  activePanelId,
  onUnpin,
  renderItem,
  unpinLabel,
  dragLabel,
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
      data-active={isActive}
      data-dragging={isDragging}
    >
      <div className="psm-session-pinned-button__content">
        {renderItem(item)}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (item.panelId) {
            onUnpin(item.panelId);
          }
        }}
        className="psm-session-pinned-button__unpin"
        aria-label={`${unpinLabel}: ${item.title}`}
        title={`${unpinLabel}: ${item.title}`}
      >
        <X className="h-2.5 w-2.5" />
      </button>
      <button
        type="button"
        className="psm-session-pinned-button__drag-indicator"
        {...attributes}
        {...listeners}
        aria-label={`${dragLabel}: ${item.title}`}
        title={`${dragLabel}: ${item.title}`}
      >
        <GripHorizontal className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}

interface SortablePinnedPanelsProps {
  items: PsmSessionToolbarItemRuntimeRegistration[];
  activePanelId: string | null;
  onUnpin: (panelId: string) => void;
  onReorder: (ids: string[]) => void;
  renderItem: (item: PsmSessionToolbarItemRuntimeRegistration) => ReactNode;
  unpinLabel: string;
  dragLabel: string;
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
  onUnpin,
  onReorder,
  renderItem,
  unpinLabel,
  dragLabel,
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
            onUnpin={onUnpin}
            renderItem={renderItem}
            unpinLabel={unpinLabel}
            dragLabel={dragLabel}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

export type { SessionFeatureItem, SortablePinnedPanelsProps };
