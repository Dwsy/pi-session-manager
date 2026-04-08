import { useCallback, useMemo } from "react";
import type { SessionEntry } from "@/types";

export interface TimelineNavItem {
  entryId: string;
  index: number;
  preview: string;
  /** 0-1, position in the scroll area */
  top: number;
}

interface UseSessionTimelineNavOptions {
  entries: SessionEntry[];
  enabled: boolean;
  previewFallback: string;
}

interface UseSessionTimelineNavResult {
  items: TimelineNavItem[];
}

export function useSessionTimelineNav({
  entries,
  enabled,
  previewFallback,
}: UseSessionTimelineNavOptions): UseSessionTimelineNavResult {
  const getMessagePreview = useCallback(
    (entry: SessionEntry): string => {
      const content = entry.message?.content || [];
      const text = content
        .filter((item) => item.type === "text" && item.text)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (!text) return previewFallback;
      return text.length > 100 ? `${text.slice(0, 100)}…` : text;
    },
    [previewFallback],
  );

  const items = useMemo<TimelineNavItem[]>(() => {
    if (!enabled || entries.length === 0) return [];

    const denominator = Math.max(entries.length - 1, 1);

    return entries
      .map((entry, index) => {
        if (
          entry.type !== "message" ||
          !entry.message ||
          entry.message.role !== "user"
        ) {
          return null;
        }

        const top = Math.min(Math.max(index / denominator, 0), 1);

        return {
          entryId: entry.id,
          index,
          preview: getMessagePreview(entry),
          top,
        };
      })
      .filter((item): item is TimelineNavItem => Boolean(item));
  }, [entries, enabled, getMessagePreview]);

  return { items };
}
