import { useMemo } from "react";
import type { LegacySessionStats, SessionEntry } from "@/types";
import { computeStats } from "@/utils/session";
import { buildActivePathIds } from "@/utils/session-tree";

export interface SessionViewerDerivedData {
  renderableEntries: SessionEntry[];
  toolResultByCallId: Map<string, SessionEntry>;
  stats: LegacySessionStats;
  headerEntry: SessionEntry | undefined;
  messageEntries: SessionEntry[];
}

function isRenderableMessageEntry(entry: SessionEntry): boolean {
  if (entry.type !== "message") return false;

  const role = entry.message?.role;
  return (
    role === "user" ||
    role === "assistant" ||
    role === "developer" ||
    role === "system"
  );
}

function isRenderableNonMessageEntry(entry: SessionEntry): boolean {
  return (
    entry.type === "model_change" ||
    entry.type === "compaction" ||
    entry.type === "branch_summary" ||
    entry.type === "custom_message"
  );
}

/** True when a later model_change follows without a renderable entry between. */
export function isFollowedByModelChange(
  entries: SessionEntry[],
  idx: number,
): boolean {
  for (let i = idx + 1; i < entries.length; i++) {
    const next = entries[i];
    if (!next) continue;
    if (next.type === "model_change") return true;
    if (next.type === "message") {
      if (isRenderableMessageEntry(next)) return false;
      continue;
    }
    if (isRenderableNonMessageEntry(next)) return false;
  }
  return false;
}

/**
 * Entries shown in the main transcript for the active branch path (root → leaf).
 * When activeEntryId is missing or not in the file, returns the unfiltered sequence.
 */
export function selectRenderableEntries(
  entries: SessionEntry[],
  activeEntryId: string | null,
  previewMode = false,
): SessionEntry[] {
  const activePresent =
    activeEntryId != null && entries.some((entry) => entry.id === activeEntryId);
  const pathIds = activePresent
    ? buildActivePathIds(activeEntryId, entries)
    : null;
  const source =
    pathIds != null ? entries.filter((entry) => pathIds.has(entry.id)) : entries;

  const renderableEntries: SessionEntry[] = [];

  for (let idx = 0; idx < source.length; idx++) {
    const entry = source[idx]!;

    if (entry.type === "message") {
      if (!isRenderableMessageEntry(entry)) {
        continue;
      }
      renderableEntries.push(entry);
      continue;
    }

    if (!previewMode && isRenderableNonMessageEntry(entry)) {
      // Collapse consecutive model_change runs on the *visible* path only,
      // so sibling-branch model switches do not hide the active branch's marker.
      if (
        entry.type === "model_change" &&
        isFollowedByModelChange(source, idx)
      ) {
        continue;
      }
      renderableEntries.push(entry);
    }
  }

  return renderableEntries;
}

export function useSessionViewerDerivedData(
  entries: SessionEntry[],
  activeEntryId: string | null,
  _isLive?: boolean,
  previewMode = false,
): SessionViewerDerivedData {
  return useMemo(() => {
    const toolResultByCallId = new Map<string, SessionEntry>();
    const messageEntries: SessionEntry[] = [];
    let headerEntry: SessionEntry | undefined;

    for (const entry of entries) {
      if (!headerEntry && entry.type === "session") {
        headerEntry = entry;
      }

      if (entry.type !== "message") {
        continue;
      }

      messageEntries.push(entry);

      if (entry.message?.role === "toolResult" && entry.message.toolCallId) {
        toolResultByCallId.set(entry.message.toolCallId, entry);
      }
    }

    return {
      renderableEntries: selectRenderableEntries(
        entries,
        activeEntryId,
        previewMode,
      ),
      toolResultByCallId,
      stats: computeStats(entries),
      headerEntry,
      messageEntries,
    };
  }, [entries, activeEntryId, previewMode]);
}
