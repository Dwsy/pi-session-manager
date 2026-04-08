import { memo, useCallback, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface TimelineNavItem {
  entryId: string;
  index: number;
  preview: string;
  /** 0-1, position in the scroll area */
  top: number;
}

interface SessionTimelineNavProps {
  items: TimelineNavItem[];
  activeEntryId: string | null;
  onNavigate: (entryId: string) => void;
}

const MAX_TIMELINE_DOTS = 60;

function sampleItems(items: TimelineNavItem[], max: number): TimelineNavItem[] {
  if (items.length <= max) return items;
  if (max <= 1) return [items[items.length - 1]];
  const sampled: TimelineNavItem[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * step);
    const item = items[idx];
    if (!item) continue;
    if (sampled[sampled.length - 1]?.entryId === item.entryId) continue;
    sampled.push(item);
  }
  const last = items[items.length - 1];
  if (sampled[sampled.length - 1]?.entryId !== last.entryId) {
    sampled.push(last);
  }
  return sampled;
}

function SessionTimelineNav({
  items,
  activeEntryId,
  onNavigate,
}: SessionTimelineNavProps) {
  const sampled = useMemo(() => sampleItems(items, MAX_TIMELINE_DOTS), [items]);
  const activeSourceIndex = useMemo(() => {
    const currentItem = items.find((item) => item.entryId === activeEntryId);
    return currentItem?.index ?? items[0]?.index ?? 0;
  }, [activeEntryId, items]);
  const currentSampledEntryId = useMemo(() => {
    return (
      [...sampled].reverse().find((item) => item.index <= activeSourceIndex)
        ?.entryId ?? sampled[0]?.entryId ?? null
    );
  }, [activeSourceIndex, sampled]);
  const currentSampledIndex = useMemo(() => {
    const index = sampled.findIndex((item) => item.entryId === currentSampledEntryId);
    return index >= 0 ? index : 0;
  }, [currentSampledEntryId, sampled]);

  const handleDotClick = useCallback(
    (entryId: string) => {
      onNavigate(entryId);
    },
    [onNavigate],
  );

  if (sampled.length === 0) return null;

  return (
    <div
      className="absolute right-3 top-1/2 z-20 -translate-y-1/2"
      role="navigation"
      aria-label="User message timeline navigation"
    >
      <div className="group flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => onNavigate(sampled[Math.max(currentSampledIndex - 1, 0)].entryId)}
          disabled={currentSampledIndex <= 0}
          className="inline-flex h-8 w-8 -translate-y-0 items-center justify-center overflow-hidden rounded-full border border-transparent px-1.5 py-1.5 text-muted-foreground transition-all duration-200 hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:translate-y-0 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent disabled:group-hover:opacity-60 opacity-0 translate-y-1"
          aria-label="Navigate to previous user message"
          title="Previous user message"
        >
          <ChevronUp className="h-4 w-4" strokeWidth={2} />
        </button>

        <div className="group/timeline flex max-h-[60vh] flex-col items-end gap-0 overflow-hidden">
          {sampled.map((item, index) => {
            const isCurrent = item.entryId === currentSampledEntryId;
            const isPast = index < currentSampledIndex;
            const dotWidthClass = isCurrent ? "w-4" : isPast ? "w-3" : "w-1.5";
            const dotColorClass = isCurrent ? "bg-primary" : "bg-muted-foreground/60";

            return (
              <button
                type="button"
                key={item.entryId}
                onClick={() => handleDotClick(item.entryId)}
                className="group/timeline-tick relative flex h-3 w-10 items-center justify-end rounded-full border border-transparent px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-100 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`Jump to user message: ${item.preview}`}
                title={item.preview}
              >
                <span
                  className={`rounded-full ${dotWidthClass} ${dotColorClass} h-px opacity-50 transition-all duration-150 group-hover/timeline-tick:w-4 group-hover/timeline-tick:bg-primary group-hover/timeline-tick:opacity-100`}
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() =>
            onNavigate(
              sampled[
                Math.min(currentSampledIndex + 1, sampled.length - 1)
              ].entryId,
            )
          }
          disabled={currentSampledIndex >= sampled.length - 1}
          className="inline-flex h-8 w-8 -translate-y-0 items-center justify-center overflow-hidden rounded-full border border-transparent px-1.5 py-1.5 text-muted-foreground transition-all duration-200 hover:bg-secondary/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:translate-y-0 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent disabled:group-hover:opacity-60 opacity-0 -translate-y-1"
          aria-label="Navigate to next user message"
          title="Next user message"
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

export default memo(SessionTimelineNav);
