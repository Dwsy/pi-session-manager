import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PointerEvent, RefObject } from "react";
import type { SessionEntry } from "@/types";

const MAX_MARKERS_DESKTOP = 180;
const MAX_MARKERS_MOBILE = 120;
const SCRUB_START_DELAY_MS = 110;
const SCRUB_START_DISTANCE_PX = 10;
const ACTIVE_MARKER_VISIBILITY_MS = 680;

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export interface ScrollMarker {
  entry: SessionEntry;
  top: number;
  preview: string;
  markerType: "user" | "compaction";
}

interface UseSessionScrollMarkersOptions {
  entries: SessionEntry[];
  isMobile: boolean;
  enabled: boolean;
  onSelectEntry: (entryId: string) => void;
  previewFallback: string;
  /**
   * The scrollable messages container. Used to measure each marker entry's
   * real vertical position so markers stay aligned even when turns are
   * collapsed/expanded (aria-expanded) or the layout reflows.
   */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /**
   * The scroll content wrapper. Observed with a ResizeObserver so positions
   * are recomputed whenever the content height changes (collapse/expand/resize).
   */
  scrollContentRef?: RefObject<HTMLElement | null>;
}

interface UseSessionScrollMarkersResult {
  markers: ScrollMarker[];
  showMarkers: boolean;
  toggleMarkers: () => void;
  activeMarkerId: string | null;
  markersPanelRef: RefObject<HTMLDivElement>;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerLeave: (event: PointerEvent) => void;
}

interface MarkerEntryPosition {
  entry: SessionEntry;
  index: number;
  markerType: "user" | "compaction";
}

interface PointerStartState {
  clientY: number;
}

function sampleMarkers(markers: ScrollMarker[], maxCount: number): ScrollMarker[] {
  if (markers.length <= maxCount) return markers;
  if (maxCount <= 1) return [markers[markers.length - 1]];

  const sampled: ScrollMarker[] = [];
  const step = (markers.length - 1) / (maxCount - 1);

  for (let i = 0; i < maxCount; i++) {
    const index = Math.round(i * step);
    const marker = markers[index];
    if (!marker) continue;
    if (sampled[sampled.length - 1]?.entry.id === marker.entry.id) continue;
    sampled.push(marker);
  }

  const lastMarker = markers[markers.length - 1];
  if (sampled[sampled.length - 1]?.entry.id !== lastMarker.entry.id) {
    sampled.push(lastMarker);
  }

  return sampled;
}

function sampleMarkerEntries(
  markers: MarkerEntryPosition[],
  maxCount: number,
): MarkerEntryPosition[] {
  if (markers.length <= maxCount) return markers;
  if (maxCount <= 1) return [markers[markers.length - 1]];

  const sampled: MarkerEntryPosition[] = [];
  const step = (markers.length - 1) / (maxCount - 1);

  for (let i = 0; i < maxCount; i++) {
    const index = Math.round(i * step);
    const marker = markers[index];
    if (!marker) continue;
    if (sampled[sampled.length - 1]?.entry.id === marker.entry.id) continue;
    sampled.push(marker);
  }

  const lastMarker = markers[markers.length - 1];
  if (sampled[sampled.length - 1]?.entry.id !== lastMarker.entry.id) {
    sampled.push(lastMarker);
  }

  return sampled;
}

export function useSessionScrollMarkers({
  entries,
  isMobile,
  enabled,
  onSelectEntry,
  previewFallback,
  scrollContainerRef,
  scrollContentRef,
}: UseSessionScrollMarkersOptions): UseSessionScrollMarkersResult {
  const [showMarkers, setShowMarkers] = useState(false);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [measuredTops, setMeasuredTops] = useState<Map<string, number>>(
    () => new Map(),
  );

  const markersPanelRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearActiveMarkerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeMarkerRef = useRef<string | null>(null);
  const pointerStartRef = useRef<PointerStartState | null>(null);
  const isScrubbingRef = useRef(false);

  const shouldComputeMarkers = enabled && (!isMobile || showMarkers);

  const markerEntryPositions = useMemo<MarkerEntryPosition[]>(() => {
    if (!shouldComputeMarkers || entries.length === 0) return [];

    return entries
      .map((entry, index) => {
        if (entry.type === "message" && entry.message?.role === "user") {
          return { entry, index, markerType: "user" as const };
        }

        const isCompaction =
          entry.type === "compaction" ||
          (entry.type === "custom_message" &&
            entry.customType === "compaction");

        if (isCompaction) {
          return { entry, index, markerType: "compaction" as const };
        }

        return null;
      })
      .filter((item): item is MarkerEntryPosition => Boolean(item));
  }, [entries, shouldComputeMarkers]);

  const measureMarkerTops = useCallback((): Map<string, number> | null => {
    const container = scrollContainerRef?.current;
    const content = scrollContentRef?.current;
    if (!container || !content || !shouldComputeMarkers) return null;

    const total = container.scrollHeight;
    if (total <= 0) return null;

    const containerTop = container.getBoundingClientRect().top;
    const offsetById = new Map<string, number>();
    const nodes = content.querySelectorAll<HTMLElement>("[data-entry-id]");
    nodes.forEach((node) => {
      const id = node.getAttribute("data-entry-id");
      if (!id) return;
      // Distance from the top of the scrollable content, independent of the
      // current scroll offset (both rects shift together while scrolling).
      offsetById.set(
        id,
        node.getBoundingClientRect().top - containerTop + container.scrollTop,
      );
    });

    const tops = new Map<string, number>();
    for (const position of markerEntryPositions) {
      const offset = offsetById.get(position.entry.id);
      if (offset != null) {
        tops.set(position.entry.id, clampRatio(offset / total));
      }
    }
    return tops;
  }, [
    scrollContainerRef,
    scrollContentRef,
    shouldComputeMarkers,
    markerEntryPositions,
  ]);

  // Recompute measured positions on layout changes. ResizeObserver does not
  // fire on scroll, so this stays cheap and is only triggered by real layout
  // shifts (collapse/expand of turns, window resize, image load, etc.).
  useLayoutEffect(() => {
    const runMeasure = () => {
      const tops = measureMarkerTops();
      if (tops) setMeasuredTops(tops);
    };

    runMeasure();

    const content = scrollContentRef?.current;
    if (!content) return;

    let rafId = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(runMeasure);
    });
    observer.observe(content);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [scrollContainerRef, scrollContentRef, measureMarkerTops]);

  // Drop stale measurements when markers are disabled/hidden.
  useEffect(() => {
    if (!shouldComputeMarkers && measuredTops.size > 0) {
      setMeasuredTops(new Map());
    }
  }, [shouldComputeMarkers, measuredTops.size]);

  const getMessagePreview = useCallback(
    (entry: SessionEntry) => {
      const isCompaction =
        entry.type === "compaction" ||
        (entry.type === "custom_message" && entry.customType === "compaction");

      if (isCompaction) {
        const rawSummary =
          entry.summary ||
          (typeof entry.content === "string" ? entry.content : "") ||
          previewFallback;
        const summary = rawSummary.replace(/\s+/g, " " ).trim();
        return summary.length > 80
          ? `📦 ${summary.slice(0, 80)}…`
          : `📦 ${summary}`;
      }

      const content = entry.message?.content || [];
      const text = content
        .filter((item) => item.type === "text" && item.text)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " " )
        .trim();

      if (!text) return previewFallback;
      return text.length > 80 ? `${text.slice(0, 80)}…` : text;
    },
    [previewFallback],
  );

  const markers = useMemo(() => {
    if (!shouldComputeMarkers) return [];
    if (markerEntryPositions.length === 0) return [];

    const indexDenominator = Math.max(entries.length - 1, 1);
    const maxMarkers = isMobile ? MAX_MARKERS_MOBILE : MAX_MARKERS_DESKTOP;
    const sampledEntries = sampleMarkerEntries(markerEntryPositions, maxMarkers);
    const sampledMarkers = sampledEntries.map(({ entry, index, markerType }) => {
      const baseline = clampRatio(index / indexDenominator);
      // Prefer the measured position when available (handles collapsed/expanded
      // turns and variable row heights); fall back to the index-based estimate.
      const top = measuredTops.get(entry.id) ?? baseline;
      return {
        entry,
        top,
        preview: getMessagePreview(entry),
        markerType,
      } satisfies ScrollMarker;
    });

    return sampleMarkers(sampledMarkers, maxMarkers);
  }, [
    shouldComputeMarkers,
    markerEntryPositions,
    entries.length,
    getMessagePreview,
    isMobile,
    measuredTops,
  ]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const clearActiveMarkerReset = useCallback(() => {
    if (clearActiveMarkerTimerRef.current) {
      clearTimeout(clearActiveMarkerTimerRef.current);
      clearActiveMarkerTimerRef.current = null;
    }
  }, []);

  const scheduleActiveMarkerReset = useCallback(() => {
    clearActiveMarkerReset();
    clearActiveMarkerTimerRef.current = setTimeout(() => {
      activeMarkerRef.current = null;
      setActiveMarkerId(null);
    }, ACTIVE_MARKER_VISIBILITY_MS);
  }, [clearActiveMarkerReset]);

  const triggerHaptic = useCallback((duration = 8) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(duration);
    }
  }, []);

  const toggleMarkers = useCallback(() => {
    if (!enabled) return;
    setShowMarkers((prev) => {
      const next = !prev;
      if (next) triggerHaptic(12);
      return next;
    });
  }, [enabled, triggerHaptic]);

  useEffect(() => {
    if (!enabled || !showMarkers) {
      clearLongPressTimer();
      clearActiveMarkerReset();
      activeMarkerRef.current = null;
      pointerStartRef.current = null;
      setActiveMarkerId(null);
      isScrubbingRef.current = false;
    }
  }, [enabled, showMarkers, clearActiveMarkerReset, clearLongPressTimer]);

  useEffect(
    () => () => {
      clearLongPressTimer();
      clearActiveMarkerReset();
    },
    [clearActiveMarkerReset, clearLongPressTimer],
  );

  const getNearestMarker = useCallback(
    (clientY: number) => {
      if (!markersPanelRef.current || markers.length === 0) return null;
      const rect = markersPanelRef.current.getBoundingClientRect();
      if (rect.height <= 0) return null;
      const ratio = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);

      let nearest = markers[0];
      let minDistance = Math.abs(nearest.top - ratio);

      for (const marker of markers) {
        const distance = Math.abs(marker.top - ratio);
        if (distance < minDistance) {
          minDistance = distance;
          nearest = marker;
        }
      }

      return nearest;
    },
    [markers],
  );

  const activateMarker = useCallback(
    (marker: ScrollMarker | null, shouldScroll: boolean) => {
      if (!marker || !enabled) return;

      clearActiveMarkerReset();
      if (activeMarkerRef.current === marker.entry.id) return;

      activeMarkerRef.current = marker.entry.id;
      setActiveMarkerId(marker.entry.id);
      if (shouldScroll) {
        onSelectEntry(marker.entry.id);
      }
      triggerHaptic(6);
    },
    [enabled, clearActiveMarkerReset, onSelectEntry, triggerHaptic],
  );

  const handleMarkersPointerDown = useCallback(
    (event: PointerEvent) => {
      if (!enabled || !isMobile || !event.isPrimary) return;
      event.preventDefault();

      clearLongPressTimer();
      clearActiveMarkerReset();
      pointerStartRef.current = { clientY: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);

      const marker = getNearestMarker(event.clientY);
      if (marker) {
        setActiveMarkerId(marker.entry.id);
      }

      const startY = event.clientY;
      longPressTimerRef.current = setTimeout(() => {
        isScrubbingRef.current = true;
        triggerHaptic(10);
        activateMarker(getNearestMarker(startY), true);
      }, SCRUB_START_DELAY_MS);
    },
    [
      enabled,
      isMobile,
      clearActiveMarkerReset,
      clearLongPressTimer,
      getNearestMarker,
      triggerHaptic,
      activateMarker,
    ],
  );

  const handleMarkersPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!enabled || !isMobile || !event.isPrimary) return;

      const start = pointerStartRef.current;
      if (!start) return;

      if (!isScrubbingRef.current) {
        if (Math.abs(event.clientY - start.clientY) < SCRUB_START_DISTANCE_PX) {
          return;
        }

        clearLongPressTimer();
        isScrubbingRef.current = true;
        triggerHaptic(10);
      }

      event.preventDefault();
      activateMarker(getNearestMarker(event.clientY), true);
    },
    [
      enabled,
      isMobile,
      clearLongPressTimer,
      triggerHaptic,
      activateMarker,
      getNearestMarker,
    ],
  );

  const handleMarkersPointerUp = useCallback(
    (event: PointerEvent) => {
      if (!enabled || !isMobile || !event.isPrimary) return;

      clearLongPressTimer();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const marker = getNearestMarker(event.clientY);
      const wasScrubbing = isScrubbingRef.current;

      if (!wasScrubbing && marker) {
        clearActiveMarkerReset();
        onSelectEntry(marker.entry.id);
        setActiveMarkerId(marker.entry.id);
        triggerHaptic(6);
      }

      isScrubbingRef.current = false;
      pointerStartRef.current = null;
      activeMarkerRef.current = null;

      if (marker || activeMarkerId) {
        scheduleActiveMarkerReset();
      } else {
        clearActiveMarkerReset();
        setActiveMarkerId(null);
      }
    },
    [
      enabled,
      isMobile,
      activeMarkerId,
      clearLongPressTimer,
      clearActiveMarkerReset,
      getNearestMarker,
      onSelectEntry,
      triggerHaptic,
      scheduleActiveMarkerReset,
    ],
  );

  return {
    markers,
    showMarkers,
    toggleMarkers,
    activeMarkerId,
    markersPanelRef,
    onPointerDown: handleMarkersPointerDown,
    onPointerMove: handleMarkersPointerMove,
    onPointerUp: handleMarkersPointerUp,
    onPointerLeave: handleMarkersPointerUp,
  };
}
