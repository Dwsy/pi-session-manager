import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent, RefObject } from "react";
import type { SessionEntry } from "../types";

const MAX_MARKERS_DESKTOP = 180;
const MAX_MARKERS_MOBILE = 120;

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

export function useSessionScrollMarkers({
  entries,
  isMobile,
  enabled,
  onSelectEntry,
  previewFallback,
}: UseSessionScrollMarkersOptions): UseSessionScrollMarkersResult {
  const [showMarkers, setShowMarkers] = useState(false);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  const markersPanelRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeMarkerRef = useRef<string | null>(null);
  const isScrubbingRef = useRef(false);

  const shouldComputeMarkers = enabled && (!isMobile || showMarkers);

  const markerEntryPositions = useMemo<MarkerEntryPosition[]>(() => {
    if (!enabled || entries.length === 0) return [];

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
  }, [entries, enabled]);

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
        const summary = rawSummary.replace(/\s+/g, " ").trim();
        return summary.length > 80
          ? `📦 ${summary.slice(0, 80)}…`
          : `📦 ${summary}`;
      }

      const content = entry.message?.content || [];
      const text = content
        .filter((item) => item.type === "text" && item.text)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
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
    const rawMarkers = markerEntryPositions.map(({ entry, index, markerType }) => {
      const top = Math.min(Math.max(index / indexDenominator, 0), 1);
      return {
        entry,
        top,
        preview: getMessagePreview(entry),
        markerType,
      } satisfies ScrollMarker;
    });

    const maxMarkers = isMobile ? MAX_MARKERS_MOBILE : MAX_MARKERS_DESKTOP;
    return sampleMarkers(rawMarkers, maxMarkers);
  }, [
    shouldComputeMarkers,
    markerEntryPositions,
    entries.length,
    getMessagePreview,
    isMobile,
  ]);

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
      activeMarkerRef.current = null;
      setActiveMarkerId(null);
      isScrubbingRef.current = false;
    }
  }, [enabled, showMarkers]);

  useEffect(
    () => () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    },
    [],
  );

  const getNearestMarker = useCallback(
    (clientY: number) => {
      if (!markersPanelRef.current || markers.length === 0) return null;
      const rect = markersPanelRef.current.getBoundingClientRect();
      if (rect.height <= 0) return null;
      const ratio = (clientY - rect.top) / rect.height;

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
      if (activeMarkerRef.current === marker.entry.id) return;

      activeMarkerRef.current = marker.entry.id;
      setActiveMarkerId(marker.entry.id);
      if (shouldScroll) {
        onSelectEntry(marker.entry.id);
      }
      triggerHaptic(6);
    },
    [enabled, onSelectEntry, triggerHaptic],
  );

  const handleMarkersPointerDown = useCallback(
    (event: PointerEvent) => {
      if (!enabled || !isMobile) return;
      event.preventDefault();

      const startY = event.clientY;
      const marker = getNearestMarker(startY);
      if (marker) {
        setActiveMarkerId(marker.entry.id);
      }

      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }

      longPressTimerRef.current = setTimeout(() => {
        isScrubbingRef.current = true;
        triggerHaptic(10);
        activateMarker(getNearestMarker(startY), true);
      }, 140);
    },
    [enabled, isMobile, getNearestMarker, activateMarker, triggerHaptic],
  );

  const handleMarkersPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!enabled || !isMobile || !isScrubbingRef.current) return;
      event.preventDefault();
      activateMarker(getNearestMarker(event.clientY), true);
    },
    [enabled, isMobile, getNearestMarker, activateMarker],
  );

  const handleMarkersPointerUp = useCallback(
    (event: PointerEvent) => {
      if (!enabled || !isMobile) return;

      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (!isScrubbingRef.current) {
        const marker = getNearestMarker(event.clientY);
        if (marker) {
          onSelectEntry(marker.entry.id);
          setActiveMarkerId(marker.entry.id);
          triggerHaptic(6);
        }
      }

      isScrubbingRef.current = false;
      activeMarkerRef.current = null;
      setActiveMarkerId(null);
    },
    [enabled, isMobile, getNearestMarker, onSelectEntry, triggerHaptic],
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
