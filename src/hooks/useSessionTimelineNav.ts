import { useCallback, useMemo } from "react";
import type { SessionEntry } from "@/types";
import { normalizePiContent } from "@/utils/session";
import { buildConversationPreviewTurns } from "@/utils/conversationTurns";

export interface TimelineNavItem {
  entryId: string;
  index: number;
  /** User prompt, used for accessible navigation labels. */
  preview: string;
  /** User prompt shown above the divider. */
  title: string;
  /** Final visible assistant answer from the same turn, never user prompt text. */
  excerpt?: string;
  /** 0–1, position in the scroll area. */
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

function messageText(entry: SessionEntry): string {
  return normalizePiContent(entry.message?.content)
    .filter((part) => part.type === "text" && part.text?.trim())
    .map((part) => part.text?.trim() ?? "")
    .join("\n")
    .trim();
}

function cleanPreviewText(input: string): string {
  // A tooltip is a plain-text synopsis, not a second Markdown renderer.
  return input
    .replace(/```[\s\S]*?```/g, " [代码片段] ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function useSessionTimelineNav({
  entries,
  enabled,
  previewFallback,
}: UseSessionTimelineNavOptions): UseSessionTimelineNavResult {
  const getUserPreview = useCallback(
    (entry: SessionEntry): string =>
      cleanPreviewText(messageText(entry)) || previewFallback,
    [previewFallback],
  );

  const items = useMemo<TimelineNavItem[]>(() => {
    if (!enabled || entries.length === 0) return [];

    const indexById = new Map(entries.map((entry, index) => [entry.id, index]));
    const denominator = Math.max(entries.length - 1, 1);

    // Share the exact turn boundaries used by the conversation viewer. This
    // ensures a reply never bleeds into the next prompt or includes tool output.
    const result = buildConversationPreviewTurns(entries).flatMap((turn) => {
      const user = turn.userEntry;
      if (!user || user.type !== "message" || user.message?.role !== "user") {
        return [];
      }
      const index = indexById.get(user.id);
      if (index === undefined) return [];

      const prompt = getUserPreview(user);
      const answer = turn.assistantEntry
        ? cleanPreviewText(messageText(turn.assistantEntry))
        : "";
      return [{
        entryId: user.id,
        index,
        preview: prompt.length > 260 ? `${prompt.slice(0, 260)}…` : prompt,
        title: prompt.length > 180 ? `${prompt.slice(0, 180)}…` : prompt,
        excerpt: answer
          ? (answer.length > 320 ? `${answer.slice(0, 320)}…` : answer)
          : undefined,
        top: Math.min(Math.max(index / denominator, 0), 1),
      }];
    });

    // A single user prompt is not useful navigation.
    return result.length >= 2 ? result : [];
  }, [entries, enabled, getUserPreview]);

  return { items };
}
