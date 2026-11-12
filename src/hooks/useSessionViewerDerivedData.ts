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
  const header = entries.find((entry) => entry.type === "session");
  let currentModel = header?.modelId
    ? { id: header.modelId, provider: header.provider || "" }
    : null;
  let conversationStarted = false;

  for (let idx = 0; idx < source.length; idx++) {
    const entry = source[idx]!;

    if (entry.type === "message") {
      if (entry.message?.role === "assistant" && entry.message.model) {
        currentModel = { id: entry.message.model, provider: entry.message.provider || "" };
      }
      if (entry.message?.role === "user" || entry.message?.role === "assistant") {
        conversationStarted = true;
      }
      if (!isRenderableMessageEntry(entry)) {
        continue;
      }
      renderableEntries.push(entry);
      continue;
    }

    if (!previewMode && isRenderableNonMessageEntry(entry)) {
      if (entry.type === "model_change" && entry.modelId) {
        const nextModel = { id: entry.modelId, provider: entry.provider || "" };
        const redundant = currentModel?.id === nextModel.id &&
          currentModel.provider === nextModel.provider;
        // Pi's first model record can initialize a session with no header model.
        const initializesSession = !currentModel && !!header && !conversationStarted;
        currentModel = nextModel;
        if (redundant || initializesSession) continue;
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
