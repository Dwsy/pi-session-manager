import { useCallback, useMemo } from "react";
import type { SessionEntry } from "../types";

interface ToolCallMeta {
  assistantId: string;
  toolName: string;
}

function getToolResultId(entry: SessionEntry): string | null {
  if (entry.type !== "message" || entry.message?.role !== "toolResult") {
    return null;
  }

  const content = Array.isArray(entry.message.content) ? entry.message.content : [];
  const toolResultContent = content.find((c: any) => c.type === "toolResult");
  const toolResultId =
    (typeof toolResultContent?.id === "string" && toolResultContent.id) ||
    (typeof entry.message.toolCallId === "string" && entry.message.toolCallId) ||
    null;

  return toolResultId;
}

export function useSessionTreeLookup(
  entries: SessionEntry[],
  activeLeafId?: string,
) {
  const entryById = useMemo(() => {
    const byId = new Map<string, SessionEntry>();
    for (const entry of entries) {
      byId.set(entry.id, entry);
    }
    return byId;
  }, [entries]);

  const toolCallById = useMemo(() => {
    const map = new Map<string, ToolCallMeta>();

    for (const entry of entries) {
      if (entry.type !== "message" || entry.message?.role !== "assistant") {
        continue;
      }

      const content = Array.isArray(entry.message.content)
        ? entry.message.content
        : [];
      for (const block of content) {
        if (block?.type === "toolCall" && typeof block.id === "string" && block.id) {
          map.set(block.id, {
            assistantId: entry.id,
            toolName: block.name || "unknown",
          });
        }
      }
    }

    return map;
  }, [entries]);

  const activePathIds = useMemo(() => {
    if (!activeLeafId) return new Set<string>();

    const pathIds = new Set<string>();
    let currentId: string | undefined = activeLeafId;

    while (currentId) {
      pathIds.add(currentId);
      const entry = entryById.get(currentId);
      if (entry?.parentId && entry.parentId !== entry.id) {
        currentId = entry.parentId;
      } else {
        break;
      }
    }

    return pathIds;
  }, [activeLeafId, entryById]);

  const resolveScrollTarget = useCallback(
    (entryId: string): string => {
      const entry = entryById.get(entryId);
      if (!entry) return entryId;

      const toolResultId = getToolResultId(entry);
      if (!toolResultId) return entryId;

      return toolCallById.get(toolResultId)?.assistantId || entryId;
    },
    [entryById, toolCallById],
  );

  const getToolResultMeta = useCallback(
    (entry: SessionEntry): ToolCallMeta | null => {
      const toolResultId = getToolResultId(entry);
      if (!toolResultId) return null;
      return toolCallById.get(toolResultId) || null;
    },
    [toolCallById],
  );

  return {
    activePathIds,
    resolveScrollTarget,
    getToolResultMeta,
  };
}
