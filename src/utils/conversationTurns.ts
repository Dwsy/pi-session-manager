import type { SessionEntry } from "@/types";
import { normalizePiContent } from "@/utils/session";

/**
 * Shared turn boundary rules for conversation rendering and the timeline.
 * Only visible assistant text after the turn's last tool/process entry counts
 * as its final answer. Earlier assistant text belongs to process history.
 */
export interface ConversationPreviewTurn {
  id: string;
  userEntry?: SessionEntry;
  processEntries: SessionEntry[];
  assistantEntry?: SessionEntry;
}

function isPromptMessage(entry: SessionEntry): boolean {
  const role = entry.message?.role;
  return (
    entry.type === "message" &&
    (role === "user" || role === "developer" || role === "system")
  );
}

function hasAssistantText(entry: SessionEntry): boolean {
  if (entry.type !== "message" || entry.message?.role !== "assistant") return false;
  return normalizePiContent(entry.message.content).some(
    (item) => item.type === "text" && Boolean(item.text?.trim()),
  );
}

export function buildConversationPreviewTurns(
  entries: SessionEntry[],
): ConversationPreviewTurn[] {
  const turns: ConversationPreviewTurn[] = [];
  let current: ConversationPreviewTurn | null = null;

  for (const entry of entries) {
    if (isPromptMessage(entry)) {
      if (current) turns.push(current);
      current = { id: entry.id, userEntry: entry, processEntries: [] };
      continue;
    }

    if (!current) {
      current = { id: entry.id, processEntries: [] };
    }

    if (hasAssistantText(entry)) {
      if (current.assistantEntry) {
        current.processEntries.push(current.assistantEntry);
      }
      current.assistantEntry = entry;
      continue;
    }

    if (current.assistantEntry) {
      current.processEntries.push(current.assistantEntry);
      current.assistantEntry = undefined;
    }
    current.processEntries.push(entry);
  }

  if (current) turns.push(current);
  return turns;
}
