import { memo, useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { triggerTimelineHoverHaptic } from "@/utils/timelineHaptics";

export interface TimelineNavItem {
  entryId: string;
  index: number;
  preview: string;
  title?: string;
  excerpt?: string;
  /** 0–1, approximate position in the scroll area */
  top: number;
}

interface SessionTimelineNavProps {
  items: TimelineNavItem[];
  activeEntryId: string | null;
  onNavigate: (entryId: string) => void;
}

interface HoverPreview {
  item: TimelineNavItem;
  right: number;
  top: number;
  width: number;
}

const MAX_TIMELINE_DOTS = 60;
const PREVIEW_WIDTH = 360;
const PREVIEW_GAP = 8;
// Allow the pointer to cross from a timeline tick to the portalled preview.
// This is only a close grace period, not a haptic throttle.
const PREVIEW_CLOSE_DELAY_MS = 260;

function sampleItems(items: TimelineNavItem[], max: number): TimelineNavItem[] {
  if (items.length <= max) return items;
  const sampled: TimelineNavItem[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    const item = items[Math.round(i * step)];
    if (item && sampled[sampled.length - 1]?.entryId !== item.entryId) {
      sampled.push(item);
    }
  }
  return sampled;
}

function SessionTimelineNav({
  items,
  activeEntryId,
  onNavigate,
}: SessionTimelineNavProps) {
  const [hoverPreview, setHoverPreview] = useState<HoverPreview | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sampled = useMemo(() => sampleItems(items, MAX_TIMELINE_DOTS), [items]);

  const cancelPreviewClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closePreview = useCallback(() => {
    cancelPreviewClose();
    setHoverPreview(null);
  }, [cancelPreviewClose]);

  const schedulePreviewClose = useCallback(() => {
    cancelPreviewClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setHoverPreview(null);
    }, PREVIEW_CLOSE_DELAY_MS);
  }, [cancelPreviewClose]);

  useEffect(() => cancelPreviewClose, [cancelPreviewClose]);

  const currentIndex = useMemo(() => {
    const sourceIndex = items.find((item) => item.entryId === activeEntryId)?.index ?? items[0]?.index ?? 0;
    const index = sampled.findLastIndex((item) => item.index <= sourceIndex);
    return Math.max(0, index);
  }, [activeEntryId, items, sampled]);

  const navigate = useCallback(
    (entryId: string) => {
      closePreview();
      onNavigate(entryId);
    },
    [closePreview, onNavigate],
  );

  const showPreview = useCallback((event: SyntheticEvent<HTMLButtonElement>, item: TimelineNavItem) => {
    cancelPreviewClose();
    const dot = event.currentTarget.getBoundingClientRect();
    const centerY = dot.top + dot.height / 2;
    const top = Math.min(Math.max(centerY, 90), Math.max(90, window.innerHeight - 90));
    setHoverPreview({
      item,
      right: window.innerWidth - dot.left + PREVIEW_GAP,
      top,
      width: Math.min(PREVIEW_WIDTH, Math.max(180, dot.left - PREVIEW_GAP - 16)),
    });
  }, [cancelPreviewClose]);

  // A single user prompt is not a timeline. This guard also covers callers
  // that bypass useSessionTimelineNav and supply items directly.
  if (items.length < 2) return null;

  return (
    <div
      className="group absolute right-0 top-1/2 z-30 -translate-y-1/2"
      role="navigation"
      aria-label="User message timeline navigation"
    >
      <div className="flex flex-col items-end gap-0.5">
        <button
          type="button"
          onClick={() => navigate(sampled[currentIndex - 1].entryId)}
          disabled={currentIndex === 0}
          className="mr-0.5 flex h-7 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-secondary/75 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100 disabled:opacity-0 disabled:group-hover:opacity-30"
          aria-label="Navigate to previous user message"
          title="Previous user message"
        >
          <ChevronUp className="h-4 w-4" />
        </button>

        <div
          className="flex max-h-[65vh] w-9 flex-col items-end overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={closePreview}
        >
          {sampled.map((item, index) => {
            const isCurrent = index === currentIndex;
            const isPast = index < currentIndex;
            return (
              <button
                key={item.entryId}
                type="button"
                onClick={() => navigate(item.entryId)}
                onMouseEnter={(event) => {
                  showPreview(event, item);
                  triggerTimelineHoverHaptic();
                }}
                onMouseLeave={schedulePreviewClose}
                onFocus={(event) => showPreview(event, item)}
                onBlur={schedulePreviewClose}
                className="group/tick flex h-[14px] w-9 shrink-0 items-center justify-end rounded-l-lg pr-[5px] transition-colors duration-150 hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`Jump to user message: ${item.preview}`}
              >
                <span
                  className={`block h-[2.5px] rounded-full transition-[width,background-color] duration-150 group-hover/tick:w-[22px] group-hover/tick:bg-foreground ${
                    isCurrent
                      ? "w-[22px] bg-foreground"
                      : isPast
                        ? "w-[14px] bg-muted-foreground/45"
                        : "w-[7px] bg-muted-foreground/40"
                  }`}
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => navigate(sampled[currentIndex + 1].entryId)}
          disabled={currentIndex === sampled.length - 1}
          className="mr-0.5 flex h-7 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-secondary/75 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100 disabled:opacity-0 disabled:group-hover:opacity-30"
          aria-label="Navigate to next user message"
          title="Next user message"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {hoverPreview && typeof document !== "undefined" && createPortal(
        <div
          role="tooltip"
          onMouseEnter={cancelPreviewClose}
          onMouseLeave={schedulePreviewClose}
          className="pointer-events-auto fixed z-[100] max-h-[210px] rounded-2xl border border-border/70 bg-popover/95 px-4 py-3.5 text-popover-foreground shadow-[0_12px_30px_-10px_rgba(0,0,0,0.22)] backdrop-blur-lg before:absolute before:left-full before:top-0 before:h-full before:w-2 before:content-['']"
          style={{
            right: hoverPreview.right,
            top: hoverPreview.top,
            width: hoverPreview.width,
            transform: "translateY(-50%)",
          }}
        >
          <div className="min-w-0">
            <div className="line-clamp-2 break-words text-sm font-semibold leading-5 tracking-normal">
              {hoverPreview.item.title || hoverPreview.item.preview}
            </div>
            <div className="mt-2 border-t border-border/60 pt-2">
              {hoverPreview.item.excerpt ? (
                <p className="line-clamp-4 break-words text-xs leading-[1.6] text-muted-foreground">
                  {hoverPreview.item.excerpt}
                </p>
              ) : (
                <p className="text-xs leading-[1.6] text-muted-foreground/70">本轮暂无最终回答</p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default memo(SessionTimelineNav);
