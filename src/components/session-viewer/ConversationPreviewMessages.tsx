import {
  Brain,
  ChevronDown,
  ChevronRight,
  Code2,
  Terminal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { SessionEntry } from "@/types";
import SessionEntryRenderer from "./SessionEntryRenderer";

interface ConversationPreviewTurn {
  id: string;
  userEntry?: SessionEntry;
  processEntries: SessionEntry[];
  assistantEntry?: SessionEntry;
}

export interface ConversationPreviewMessagesProps {
  entries: SessionEntry[];
  toolResultByCallId: Map<string, SessionEntry>;
  searchQuery: string;
  streamingId: string | null;
  scrollTargetId: string | null;
  setScrollTargetId: (entryId: string | null) => void;
}

function isPromptMessage(entry: SessionEntry): boolean {
  const role = entry.message?.role;
  return (
    entry.type === "message" &&
    (role === "user" || role === "developer" || role === "system")
  );
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

export function buildConversationPreviewTurns(
  entries: SessionEntry[],
): ConversationPreviewTurn[] {
  const turns: ConversationPreviewTurn[] = [];
  let current: ConversationPreviewTurn | null = null;

  for (const entry of entries) {
    if (isPromptMessage(entry)) {
      if (current) turns.push(current);
      current = {
        id: entry.id,
        userEntry: entry,
        processEntries: [],
      };
      continue;
    }

    if (!current) {
      current = {
        id: entry.id,
        processEntries: [],
      };
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

function getEntrySummaryKeys(entry: SessionEntry, fallback: string): string[] {
  if (entry.type === "message") {
    const role = entry.message?.role;
    if (role === "assistant") {
      const keys = (entry.message?.content ?? []).flatMap((item) => {
        if (item.type === "toolCall" && item.name) return [`tool:${item.name}`];
        if (item.type === "thinking") return ["thinking"];
        return [];
      });
      return keys.length > 0 ? keys : [fallback];
    }
    return [role || fallback];
  }

  if (entry.type === "custom_message") return [entry.customType || fallback];
  return [entry.type || fallback];
}

interface ProcessSummaryItem {
  key: string;
  label: string;
  count: number;
  icon: "bash" | "read" | "write" | "edit" | "thinking" | "tool" | "process";
}

function getToolIconKind(label: string): ProcessSummaryItem["icon"] {
  const normalized = label.toLowerCase();
  if (normalized === "bash" || normalized === "shell" || normalized === "exec") return "bash";
  if (normalized === "read" || normalized === "read_file") return "read";
  if (normalized === "write" || normalized === "write_file") return "write";
  if (normalized === "edit" || normalized === "edit_file" || normalized === "multiedit" || normalized === "apply_patch") return "edit";
  return "tool";
}

function getSummaryItemIconKind(key: string): ProcessSummaryItem["icon"] {
  if (key === "thinking") return "thinking";
  if (key.startsWith("tool:"))
    return getToolIconKind(key.slice("tool:".length));
  return "process";
}

function InlineToolIcon({ kind }: { kind: ProcessSummaryItem["icon"] }) {
  const className = "h-3.5 w-3.5 flex-shrink-0";
  if (kind === "bash") return <Terminal className={className} />;
  if (kind === "thinking") return <Brain className={className} />;
  if (kind === "process") return <Code2 className={className} />;

  if (kind === "read") {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    );
  }

  if (kind === "write") {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
    );
  }

  if (kind === "edit") {
    return (
      <svg
        className={className}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
        />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function getProcessSummaryItems(
  entries: SessionEntry[],
  fallback: string,
): ProcessSummaryItem[] {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    for (const key of getEntrySummaryKeys(entry, fallback)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([key, count]) => {
      const label = key.startsWith("tool:") ? key.slice("tool:".length) : key;
      return {
        key,
        label,
        count,
        icon: getSummaryItemIconKind(key),
      };
    });
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

  const summaryItems = getProcessSummaryItems(
    entries,
    t("session.preview.process", "process"),
  );

  return (
    <div className="group/process-summary relative flex h-9 w-full overflow-hidden rounded-sm border border-border/70 bg-secondary/30 transition-colors hover:bg-secondary/45">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left text-xs text-muted-foreground focus-ring"
        aria-expanded={expanded}
      >
        <span className="inline-flex w-14 flex-shrink-0 items-center gap-1.5 font-medium text-foreground/80">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          <span className="inline-block w-9">
            {expanded
              ? t("session.preview.hide", "Hide")
              : t("session.preview.show", "Show")}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-x-2 overflow-hidden whitespace-nowrap">
          {summaryItems.map((item) => (
            <span
              key={item.key}
              className="inline-flex flex-shrink-0 items-center gap-1 text-muted-foreground"
            >
              <InlineToolIcon kind={item.icon} />
              <span>{item.label}</span>
              {item.count > 1 && <span>×{item.count}</span>}
            </span>
          ))}
        </span>
      </button>
    </div>
  );
}

function ConversationPreviewTurnView({
  turn,
  toolResultByCallId,
  searchQuery,
  streamingId,
  expanded,
  onToggle,
}: {
  turn: ConversationPreviewTurn;
  toolResultByCallId: Map<string, SessionEntry>;
  searchQuery: string;
  streamingId: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-2" data-entry-id={turn.id}>
      {turn.userEntry && (
        <SessionEntryRenderer
          entry={turn.userEntry}
          toolResultByCallId={toolResultByCallId}
          searchQuery={searchQuery}
          previewMode
        />
      )}

      {!expanded && (
        <CollapsedProcessSummary
          entries={turn.processEntries}
          expanded={expanded}
          onToggle={onToggle}
        />
      )}

      {expanded && (
        <div className="space-y-2">
          <div className="sticky top-2 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-2">
            <CollapsedProcessSummary
              entries={turn.processEntries}
              expanded={expanded}
              onToggle={onToggle}
            />
          </div>
          {turn.processEntries.map((entry, index) => (
            <SessionEntryRenderer
              key={`${entry.id}:${entry.type}:${index}`}
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
  scrollTargetId,
  setScrollTargetId,
}: ConversationPreviewMessagesProps) {
  const turns = useMemo(
    () => buildConversationPreviewTurns(entries),
    [entries],
  );
  const [expandedTurnIds, setExpandedTurnIds] = useState<Set<string>>(
    new Set(),
  );

  const targetTurnId = useMemo(() => {
    if (!scrollTargetId) return null;
    for (const turn of turns) {
      if (
        turn.userEntry?.id === scrollTargetId ||
        turn.assistantEntry?.id === scrollTargetId
      ) {
        return turn.id;
      }
      if (turn.processEntries.some((entry) => entry.id === scrollTargetId)) {
        return turn.id;
      }
    }
    return null;
  }, [scrollTargetId, turns]);

  useEffect(() => {
    if (!scrollTargetId || !targetTurnId) return;

    setExpandedTurnIds((prev) => {
      if (prev.has(targetTurnId)) return prev;
      const next = new Set(prev);
      next.add(targetTurnId);
      return next;
    });

    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const target =
          document.getElementById(`entry-${scrollTargetId}`) ??
          document.querySelector(
            `[data-entry-id="${CSS.escape(scrollTargetId)}"]`,
          );
        if (!target) return;

        target.scrollIntoView({ block: "center", inline: "nearest" });
        target.classList.add("highlight");
        window.setTimeout(() => {
          target.classList.remove("highlight");
        }, 2000);
        setScrollTargetId(null);
      });
    });

    return () => cancelAnimationFrame(rafId);
  }, [scrollTargetId, setScrollTargetId, targetTurnId]);

  const toggleTurn = (turnId: string) => {
    setExpandedTurnIds((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4 px-1 py-2">
      {turns.map((turn) => (
        <ConversationPreviewTurnView
          key={turn.id}
          turn={turn}
          toolResultByCallId={toolResultByCallId}
          searchQuery={searchQuery}
          streamingId={streamingId}
          expanded={expandedTurnIds.has(turn.id)}
          onToggle={() => toggleTurn(turn.id)}
        />
      ))}
    </div>
  );
}
