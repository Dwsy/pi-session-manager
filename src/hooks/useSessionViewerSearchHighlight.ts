import { useEffect } from "react";

import type { SessionSearchTarget } from "@/hooks/useSessionViewerInMessageSearch";

const SEARCH_MATCH_RETRY_COUNT = 8;
const SEARCH_MATCH_RETRY_DELAY_MS = 50;

export interface UseSessionViewerSearchHighlightOptions {
  container: HTMLElement | null;
  searchQuery: string;
  currentSearchTarget: SessionSearchTarget | null;
  scrollToEntryId: (entryId: string, align?: "auto" | "center" | "end" | "start") => boolean;
  ensureToolExpandedForSearch: (entryId: string) => void;
}

export function useSessionViewerSearchHighlight({
  container,
  searchQuery,
  currentSearchTarget,
  scrollToEntryId,
  ensureToolExpandedForSearch,
}: UseSessionViewerSearchHighlightOptions) {
  useEffect(() => {
    if (!container) {
      return;
    }

    const clearCurrentHighlight = () => {
      container
        .querySelectorAll<HTMLElement>(".search-highlight.current")
        .forEach((element) => element.classList.remove("current"));
    };

    clearCurrentHighlight();

    if (!searchQuery.trim() || !currentSearchTarget) {
      return;
    }

    scrollToEntryId(currentSearchTarget.rowEntryId, "center");
    if (currentSearchTarget.matchElementId !== currentSearchTarget.rowEntryId) {
      ensureToolExpandedForSearch(currentSearchTarget.matchElementId);
    }

    let animationFrameId = 0;
    let retryTimeoutId: number | null = null;
    let retryCount = 0;

    const tryActivateCurrentMatch = () => {
      const entryElement = container.querySelector<HTMLElement>(
        `#entry-${currentSearchTarget.matchElementId}`,
      );
      const highlights = entryElement?.querySelectorAll<HTMLElement>(
        ".search-highlight",
      );
      const currentHighlight = highlights?.[
        currentSearchTarget.occurrenceIndexInElement
      ];

      if (currentHighlight) {
        clearCurrentHighlight();
        currentHighlight.classList.add("current");
        currentHighlight.scrollIntoView({
          block: "center",
          inline: "nearest",
        });
        return;
      }

      if (retryCount >= SEARCH_MATCH_RETRY_COUNT) {
        return;
      }

      retryCount += 1;
      retryTimeoutId = window.setTimeout(() => {
        animationFrameId = requestAnimationFrame(tryActivateCurrentMatch);
      }, SEARCH_MATCH_RETRY_DELAY_MS);
    };

    animationFrameId = requestAnimationFrame(tryActivateCurrentMatch);

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (retryTimeoutId) {
        window.clearTimeout(retryTimeoutId);
      }
    };
  }, [
    container,
    searchQuery,
    currentSearchTarget,
    scrollToEntryId,
    ensureToolExpandedForSearch,
  ]);
}
