import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SessionEntry } from "@/types";
import SessionEntryRenderer from "./SessionEntryRenderer";

interface ConversationPreviewTurn {
  id: string;
  userEntry: SessionEntry;
  processEntries: SessionEntry[];
  assistantEntry?: SessionEntry;
}

export interface ConversationPreviewMessagesProps {
  entries: SessionEntry[];
  toolResultByCallId: Map<string, SessionEntry>;
  searchQuery: string;
  streamingId: string | null;
}

function isUserMessage(entry: SessionEntry): boolean {
  return entry.type === "message" && entry.message?.role === "user";
}

function isAssistantMessage(entry: SessionEntry): boolean {
  return entry.type === "message" && entry.message?.role === "assistant";
}

function hasAssistantText(entry: SessionEntry): boolean {
  if (!isAssistantMessage(entry)) return false;
  return (entry.message?.content ?? []).some(
    (item) => item.type === "text" && Boolean(item.text?.trim()),
  );
}

function buildConversationPreviewTurns(entries: SessionEntry[]): ConversationPreviewTurn[] {
  const turns: ConversationPreviewTurn[] = [];
  let current: ConversationPreviewTurn | null = null;

  for (const entry of entries) {
    if (isUserMessage(entry)) {
      if (current) turns.push(current);
      current = {
        id: entry.id,
        userEntry: entry,
        processEntries: [],
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (hasAssistantText(entry)) {
      if (current.assistantEntry) {
        current.processEntries.push(current.assistantEntry);
      }
      current.assistantEntry = entry;
      continue;
    }

    current.processEntries.push(entry);
  }

  if (current) turns.push(current);
  return turns;
}

function getEntryLabel(entry: SessionEntry, fallback: string): string {
  if (entry.type === "message") {
    const role = entry.message?.role;
    if (role === "assistant") {
      const toolNames = (entry.message?.content ?? [])
        .filter((item) => item.type === "toolCall" && item.name)
        .map((item) => item.name as string);
      if (toolNames.length > 0) return toolNames.join(", ");
      const hasThinking = (entry.message?.content ?? []).some((item) => item.type === "thinking");
      return hasThinking ? "thinking" : fallback;
    }
    return role || fallback;
  }

  if (entry.type === "custom_message") return entry.customType || fallback;
  return entry.type || fallback;
}

function CollapsedProcessSummary({
  entries,
  expanded,
  onToggle,
}: {
  entries: SessionEntry[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;

  const labels = entries.slice(0, 3).map((entry) => getEntryLabel(entry, t("session.preview.process", "process")));
  const suffix = entries.length > 3 ? ` +${entries.length - 3}` : "";

  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full rounded-md border border-border/70 bg-secondary/35 hover:bg-secondary/55 px-3 py-2 text-left transition-colors"
      aria-expanded={expanded}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-medium text-foreground/80">
          {expanded
            ? t("session.preview.hideProcess", "Hide process")
            : t("session.preview.showProcess", "Show process")}
        </span>
        <span className="truncate">
          {entries.length} {t("session.preview.processItems", "intermediate items")}: {labels.join(" · ")}{suffix}
        </span>
      </div>
    </button>
  );
}

function ConversationPreviewTurnView({
  turn,
  toolResultByCallId,
  searchQuery,
  streamingId,
}: {
  turn: ConversationPreviewTurn;
  toolResultByCallId: Map<string, SessionEntry>;
  searchQuery: string;
  streamingId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-2" data-entry-id={turn.id}>
      <SessionEntryRenderer
        entry={turn.userEntry}
        toolResultByCallId={toolResultByCallId}
        searchQuery={searchQuery}
        previewMode
      />

      <CollapsedProcessSummary
        entries={turn.processEntries}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      />

      {expanded && (
        <div className="ml-4 border-l border-border/70 pl-3 space-y-2">
          {turn.processEntries.map((entry) => (
            <SessionEntryRenderer
              key={entry.id}
              entry={entry}
              toolResultByCallId={toolResultByCallId}
              searchQuery={searchQuery}
              isStreaming={entry.id === streamingId}
              previewMode={false}
            />
          ))}
        </div>
      )}

      {turn.assistantEntry && (
        <SessionEntryRenderer
          entry={turn.assistantEntry}
          toolResultByCallId={toolResultByCallId}
          searchQuery={searchQuery}
          isStreaming={turn.assistantEntry.id === streamingId}
          previewMode
        />
      )}
    </div>
  );
}

export default function ConversationPreviewMessages({
  entries,
  toolResultByCallId,
  searchQuery,
  streamingId,
}: ConversationPreviewMessagesProps) {
  const turns = useMemo(() => buildConversationPreviewTurns(entries), [entries]);

  return (
    <div className="space-y-4 px-1 py-2">
      {turns.map((turn) => (
        <ConversationPreviewTurnView
          key={turn.id}
          turn={turn}
          toolResultByCallId={toolResultByCallId}
          searchQuery={searchQuery}
          streamingId={streamingId}
        />
      ))}
    </div>
  );
}
