import {
  Brain,
  ChevronDown,
  ChevronRight,
  Code2,
  ListFilter,
  Terminal,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { SessionEntry } from "@/types";
import { normalizePiContent } from "@/utils/session";
import { requestToolReview } from "@/contexts/toolReviewBus";
import { estimateSessionEntrySize } from "@/hooks/useSessionViewerVirtualScroll";
import SessionEntryRenderer from "./SessionEntryRenderer";

interface ConversationPreviewTurn {
  id: string;
  userEntry?: SessionEntry;
  processEntries: SessionEntry[];
  assistantEntry?: SessionEntry;
}

export type ConversationFoldMode = "wholeTurn" | "toolGroups";

export interface ConversationPreviewMessagesProps {
  entries: SessionEntry[];
  toolResultByCallId: Map<string, SessionEntry>;
  searchQuery: string;
  streamingId: string | null;
  scrollTargetId: string | null;
  setScrollTargetId: (entryId: string | null) => void;
  foldMode?: ConversationFoldMode;
  /** Scroller that owns the list (the session viewer scroll container). */
  scrollElementRef?: RefObject<HTMLDivElement | null>;
  /** Live follow: scroll to bottom on new turns while the flag stays set. */
  pendingScrollToBottomRef?: MutableRefObject<boolean>;
}

export interface ConversationPreviewMessagesHandle {
  scrollToTop: () => void;
  scrollToBottom: () => void;
  scrollToEntryId: (
    entryId: string,
    align?: "auto" | "center" | "end" | "start",
  ) => boolean;
}

// Replaces the former space-y-3 margins: virtualizer measurement sees element
// heights only, so inter-row spacing must live inside the measured row.
const TURN_GAP_PX = 12;
const TURN_OVERSCAN = 3;
const DEFAULT_TURN_HEIGHT_PX = 480;

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
  return normalizePiContent(entry.message?.content).some(
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

    // Once more process work appears, the previous text response was an
    // intermediate boundary rather than the turn's final assistant message.
    // Flush it before the new entry so V2 grouping sees the real chronology.
    if (current.assistantEntry) {
      current.processEntries.push(current.assistantEntry);
      current.assistantEntry = undefined;
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
      const keys = normalizePiContent(entry.message?.content).flatMap((item) => {
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
  preserveFirstAppearance = false,
): ProcessSummaryItem[] {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    for (const key of getEntrySummaryKeys(entry, fallback)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const summaryEntries = Array.from(counts.entries());
  if (!preserveFirstAppearance) {
    summaryEntries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  return summaryEntries
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
  summaryEntries = entries,
  preserveSummaryOrder = false,
  expanded,
  onToggle,
  toolResultByCallId,
}: {
  entries: SessionEntry[];
  summaryEntries?: SessionEntry[];
  preserveSummaryOrder?: boolean;
  expanded: boolean;
  onToggle: () => void;
  toolResultByCallId: Map<string, SessionEntry>;
}) {
  const { t } = useTranslation();

  const handleReview = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      requestToolReview({
        entries,
        toolResultByCallId,
      });
    },
    [entries, toolResultByCallId],
  );

  if (entries.length === 0) return null;

  const summaryItems = getProcessSummaryItems(
    summaryEntries,
    t("session.preview.process", "process"),
    preserveSummaryOrder,
  );

  const hasReviewableOps = summaryItems.some((item) =>
    item.key.startsWith("tool:"),
  );

  return (
    <div className={`conversation-process-summary ${expanded ? "is-expanded" : ""}`.trim()}>
      <button
        type="button"
        onClick={onToggle}
        className="conversation-process-summary__toggle focus-ring"
        aria-expanded={expanded}
      >
        <span className="conversation-process-summary__action">
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
        <span className="conversation-process-summary__items">
          {summaryItems.map((item) => (
            <span
              key={item.key}
              className="conversation-process-summary__item"
            >
              <InlineToolIcon kind={item.icon} />
              <span>{item.label}</span>
              {item.count > 1 && <span>×{item.count}</span>}
            </span>
          ))}
        </span>
      </button>
      <button
        type="button"
        onClick={handleReview}
        disabled={!hasReviewableOps}
        className="conversation-process-summary__review focus-ring"
        aria-label={t("session.preview.review", "Review tool calls")}
        title={t("session.preview.review", "Review tool calls")}
      >
        <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">
          {t("session.preview.reviewShort", "Review")}
        </span>
      </button>
    </div>
  );
}

function getProcessEntryKind(entry: SessionEntry): "tool" | "thinking" | "event" {
  if (entry.type !== "message" || entry.message?.role !== "assistant") return "event";
  const content = normalizePiContent(entry.message.content);
  if (content.some((item) => item.type === "toolCall")) return "tool";
  if (content.some((item) => item.type === "thinking")) return "thinking";
  return "event";
}

type ToolGroupRunStep = "member" | "thought" | "transparent" | "break";

export type ToolCallPreviewSegment =
  | {
      kind: "entry";
      entry: SessionEntry;
      sourceIndex: number;
    }
  | {
      kind: "group";
      id: string;
      entries: SessionEntry[];
      memberEntries: SessionEntry[];
      transparentEntries: SessionEntry[];
    };

function getToolGroupRunStep(
  entry: SessionEntry,
  streamingId: string | null,
): ToolGroupRunStep {
  if (entry.type !== "message") return "break";

  const role = entry.message?.role;
  if (role === "toolResult") return "transparent";
  if (role !== "assistant") return "break";

  const content = normalizePiContent(entry.message?.content);
  const hasVisibleText = content.some(
    (item) => item.type === "text" && Boolean(item.text?.trim()),
  );
  if (hasVisibleText) return "break";

  if (content.some((item) => item.type === "toolCall")) return "member";
  if (content.some((item) => item.type === "thinking")) {
    return entry.id === streamingId ? "transparent" : "thought";
  }
  return "break";
}

/**
 * Grok-inspired view-time grouping for one conversation turn.
 *
 * Tool-call entries are counted members. Finished thinking can be claimed into
 * a run without appearing in its summary, while tool results and live thinking
 * stay transparent so they do not split surrounding calls. Any visible text or
 * non-message event is a hard boundary. A run folds only when it contains at
 * least one tool member, matching Grok's eager singleton-group behavior.
 */
export function buildToolCallPreviewSegments(
  entries: SessionEntry[],
  streamingId: string | null = null,
): ToolCallPreviewSegment[] {
  const segments: ToolCallPreviewSegment[] = [];
  let index = 0;

  while (index < entries.length) {
    const startStep = getToolGroupRunStep(entries[index], streamingId);
    if (startStep !== "member" && startStep !== "thought") {
      segments.push({ kind: "entry", entry: entries[index], sourceIndex: index });
      index += 1;
      continue;
    }

    const runStart = index;
    const memberEntries: SessionEntry[] = [];
    const transparentEntries: SessionEntry[] = [];
    let cursor = index;

    while (cursor < entries.length) {
      const step = getToolGroupRunStep(entries[cursor], streamingId);
      if (step === "break") break;
      if (step === "member") memberEntries.push(entries[cursor]);
      if (step === "transparent") transparentEntries.push(entries[cursor]);
      cursor += 1;
    }

    if (memberEntries.length > 0) {
      segments.push({
        kind: "group",
        id: `${entries[runStart].id}:${runStart}`,
        entries: entries.slice(runStart, cursor),
        memberEntries,
        transparentEntries,
      });
    } else {
      for (let sourceIndex = runStart; sourceIndex < cursor; sourceIndex += 1) {
        segments.push({
          kind: "entry",
          entry: entries[sourceIndex],
          sourceIndex,
        });
      }
    }

    index = Math.max(cursor, index + 1);
  }

  return segments;
}

function splitProcessEntries(entries: SessionEntry[]): {
  modelChanges: SessionEntry[];
  foldableEntries: SessionEntry[];
} {
  const modelChanges: SessionEntry[] = [];
  const foldableEntries: SessionEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "model_change") {
      modelChanges.push(entry);
    } else {
      foldableEntries.push(entry);
    }
  }
  return { modelChanges, foldableEntries };
}

function ToolGroupedProcessEntries({
  entries,
  allProcessEntries,
  toolResultByCallId,
  searchQuery,
  streamingId,
  expandedGroupIds,
  onToggleGroup,
}: {
  entries: SessionEntry[];
  allProcessEntries: SessionEntry[];
  toolResultByCallId: Map<string, SessionEntry>;
  searchQuery: string;
  streamingId: string | null;
  expandedGroupIds: Set<string>;
  onToggleGroup: (groupId: string) => void;
}) {
  const segments = useMemo(
    () => buildToolCallPreviewSegments(entries, streamingId),
    [entries, streamingId],
  );

  return (
    <>
      {segments.map((segment, segmentIndex) => {
        if (segment.kind === "entry") {
          const entry = segment.entry;
          return (
            <SessionEntryRenderer
              key={`${entry.id}:${entry.type}:${segment.sourceIndex}`}
              entry={entry}
              toolResultByCallId={toolResultByCallId}
              searchQuery={searchQuery}
              isStreaming={entry.id === streamingId}
              previewMode={false}
              processEntries={allProcessEntries}
            />
          );
        }

        const expanded = expandedGroupIds.has(segment.id);
        if (!expanded) {
          return (
            <div key={`tool-group:${segment.id}:${segmentIndex}`}>
              <CollapsedProcessSummary
                entries={segment.entries}
                summaryEntries={segment.memberEntries}
                preserveSummaryOrder
                expanded={false}
                onToggle={() => onToggleGroup(segment.id)}
                toolResultByCallId={toolResultByCallId}
              />
              {segment.transparentEntries.map((entry, index) => (
                <SessionEntryRenderer
                  key={`transparent:${entry.id}:${entry.type}:${index}`}
                  entry={entry}
                  toolResultByCallId={toolResultByCallId}
                  searchQuery={searchQuery}
                  isStreaming={entry.id === streamingId}
                  previewMode={false}
                  processEntries={allProcessEntries}
                />
              ))}
            </div>
          );
        }

        return (
          <div
            key={`tool-group:${segment.id}:${segmentIndex}`}
            className="conversation-preview-process"
          >
            <div className="conversation-preview-process__header">
              <CollapsedProcessSummary
                entries={segment.entries}
                summaryEntries={segment.memberEntries}
                preserveSummaryOrder
                expanded
                onToggle={() => onToggleGroup(segment.id)}
                toolResultByCallId={toolResultByCallId}
              />
            </div>
            <div className="conversation-preview-process__list" role="list">
              {segment.entries.map((entry, index) => (
                <div
                  key={`${entry.id}:${entry.type}:${index}`}
                  className="conversation-preview-process__entry"
                  data-process-kind={getProcessEntryKind(entry)}
                  role="listitem"
                >
                  <SessionEntryRenderer
                    entry={entry}
                    toolResultByCallId={toolResultByCallId}
                    searchQuery={searchQuery}
                    isStreaming={entry.id === streamingId}
                    previewMode={false}
                    processEntries={allProcessEntries}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function estimateTurnHeight(
  turn: ConversationPreviewTurn,
  foldMode: ConversationFoldMode,
): number {
  const userHeight = turn.userEntry
    ? estimateSessionEntrySize(turn.userEntry, undefined, true)
    : 0;
  const assistantHeight = turn.assistantEntry
    ? estimateSessionEntrySize(turn.assistantEntry, undefined, true)
    : 0;

  let processHeight: number;
  if (foldMode === "wholeTurn") {
    processHeight = 64; // collapsed whole-turn process summary
  } else {
    processHeight = 0;
    for (const segment of buildToolCallPreviewSegments(turn.processEntries)) {
      processHeight +=
        segment.kind === "entry"
          ? estimateSessionEntrySize(segment.entry, undefined, false)
          : 48; // collapsed tool-group summary row
    }
  }
  return 8 + userHeight + assistantHeight + processHeight + TURN_GAP_PX;
}

function ConversationPreviewTurnView({
  turn,
  toolResultByCallId,
  searchQuery,
  streamingId,
  foldMode,
  expanded,
  onToggle,
  expandedGroupIds,
  onToggleGroup,
}: {
  turn: ConversationPreviewTurn;
  toolResultByCallId: Map<string, SessionEntry>;
  searchQuery: string;
  streamingId: string | null;
  foldMode: ConversationFoldMode;
  expanded: boolean;
  onToggle: () => void;
  expandedGroupIds: Set<string>;
  onToggleGroup: (groupId: string) => void;
}) {
  // Legacy whole-turn folding keeps model_change visible outside its summary.
  const { modelChanges, foldableEntries } = useMemo(
    () => splitProcessEntries(turn.processEntries),
    [turn.processEntries],
  );

  return (
    <div className="conversation-preview-turn space-y-1.5" data-entry-id={turn.id}>
      {turn.userEntry && (
        <SessionEntryRenderer
          entry={turn.userEntry}
          toolResultByCallId={toolResultByCallId}
          searchQuery={searchQuery}
          previewMode
        />
      )}

      {foldMode === "toolGroups" ? (
        <ToolGroupedProcessEntries
          entries={turn.processEntries}
          allProcessEntries={turn.processEntries}
          toolResultByCallId={toolResultByCallId}
          searchQuery={searchQuery}
          streamingId={streamingId}
          expandedGroupIds={expandedGroupIds}
          onToggleGroup={onToggleGroup}
        />
      ) : (
        <>
          {modelChanges.map((entry, index) => (
            <SessionEntryRenderer
              key={`${entry.id}:${entry.type}:${index}`}
              entry={entry}
              toolResultByCallId={toolResultByCallId}
              searchQuery={searchQuery}
              isStreaming={entry.id === streamingId}
              previewMode={false}
              processEntries={turn.processEntries}
            />
          ))}

          {!expanded && foldableEntries.length > 0 && (
            <CollapsedProcessSummary
              entries={foldableEntries}
              expanded={expanded}
              onToggle={onToggle}
              toolResultByCallId={toolResultByCallId}
            />
          )}

          {expanded && foldableEntries.length > 0 && (
            <div className="conversation-preview-process">
              <div className="conversation-preview-process__header">
                <CollapsedProcessSummary
                  entries={foldableEntries}
                  expanded={expanded}
                  onToggle={onToggle}
                  toolResultByCallId={toolResultByCallId}
                />
              </div>
              <div className="conversation-preview-process__list" role="list">
                {foldableEntries.map((entry, index) => (
                  <div
                    key={`${entry.id}:${entry.type}:${index}`}
                    className="conversation-preview-process__entry"
                    data-process-kind={getProcessEntryKind(entry)}
                    role="listitem"
                  >
                    <SessionEntryRenderer
                      entry={entry}
                      toolResultByCallId={toolResultByCallId}
                      searchQuery={searchQuery}
                      isStreaming={entry.id === streamingId}
                      previewMode={false}
                      processEntries={turn.processEntries}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {turn.assistantEntry && (
        <SessionEntryRenderer
          entry={turn.assistantEntry}
          toolResultByCallId={toolResultByCallId}
          searchQuery={searchQuery}
          isStreaming={turn.assistantEntry.id === streamingId}
          previewMode
          processEntries={turn.processEntries}
        />
      )}
    </div>
  );
}

const ConversationPreviewMessages = forwardRef<
  ConversationPreviewMessagesHandle,
  ConversationPreviewMessagesProps
>(function ConversationPreviewMessages(
  {
    entries,
    toolResultByCallId,
    searchQuery,
    streamingId,
    scrollTargetId,
    setScrollTargetId,
    foldMode = "toolGroups",
    scrollElementRef,
    pendingScrollToBottomRef,
  },
  ref,
) {
  const turns = useMemo(
    () => buildConversationPreviewTurns(entries),
    [entries],
  );
  // Expansion state lives here (not inside rows) so virtualized rows keep
  // their folded/expanded state across unmount/remount while scrolling.
  const [expandedTurnIds, setExpandedTurnIds] = useState<Set<string>>(
    new Set(),
  );
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    new Set(),
  );

  const contentRef = useRef<HTMLDivElement>(null);

  // Estimated heights are precomputed once per entry set: building tool-group
  // segments inside estimateSize would make every measurement rebuild O(session).
  const turnEstimates = useMemo(() => {
    const estimates = new Map<string, number>();
    for (const turn of turns) {
      estimates.set(turn.id, estimateTurnHeight(turn, foldMode));
    }
    return estimates;
  }, [turns, foldMode]);

  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: turns.length,
    getScrollElement: () => scrollElementRef?.current ?? null,
    estimateSize: (index) =>
      turnEstimates.get(turns[index]?.id ?? "") ?? DEFAULT_TURN_HEIGHT_PX,
    overscan: TURN_OVERSCAN,
    lanes: 1,
    isScrollingResetDelay: 200,
    useAnimationFrameWithResizeObserver: true,
  });

  // Expanding/collapsing turns or tool groups changes row heights. Re-measure
  // mounted rows synchronously so rows below reposition in the same frame —
  // stale heights here are what made folded sections overlap.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    content
      .querySelectorAll<HTMLDivElement>("[data-index]")
      .forEach((row) => rowVirtualizer.measureElement(row));
  }, [expandedTurnIds, expandedGroupIds, rowVirtualizer]);

  const toggleTurn = useCallback((turnId: string) => {
    setExpandedTurnIds((prev) => {
      const next = new Set(prev);
      if (next.has(turnId)) {
        next.delete(turnId);
      } else {
        next.add(turnId);
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const turnIndexById = useMemo(() => {
    const indexById = new Map<string, number>();
    turns.forEach((turn, index) => indexById.set(turn.id, index));
    return indexById;
  }, [turns]);

  const turnByEntryId = useMemo(() => {
    const byEntryId = new Map<string, ConversationPreviewTurn>();
    for (const turn of turns) {
      if (turn.userEntry) byEntryId.set(turn.userEntry.id, turn);
      if (turn.assistantEntry) byEntryId.set(turn.assistantEntry.id, turn);
      for (const entry of turn.processEntries) byEntryId.set(entry.id, turn);
    }
    return byEntryId;
  }, [turns]);

  const getScroller = useCallback(
    () => scrollElementRef?.current ?? null,
    [scrollElementRef],
  );

  const getContentOffsetTop = useCallback(() => {
    const scroller = getScroller();
    const content = contentRef.current;
    if (!scroller || !content) return 0;
    return (
      content.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop
    );
  }, [getScroller]);

  const scrollToTop = useCallback(() => {
    const scroller = getScroller();
    if (!scroller) return;
    scroller.scrollTop = 0;
  }, [getScroller]);

  const scrollToBottom = useCallback(() => {
    const scroller = getScroller();
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [getScroller]);

  const expandForEntry = useCallback(
    (turn: ConversationPreviewTurn, entryId: string) => {
      if (foldMode === "wholeTurn") {
        setExpandedTurnIds((prev) => {
          if (prev.has(turn.id)) return prev;
          const next = new Set(prev);
          next.add(turn.id);
          return next;
        });
      }
      for (const segment of buildToolCallPreviewSegments(
        turn.processEntries,
        streamingId,
      )) {
        if (
          segment.kind === "group" &&
          segment.entries.some((entry) => entry.id === entryId)
        ) {
          setExpandedGroupIds((prev) => {
            if (prev.has(segment.id)) return prev;
            const next = new Set(prev);
            next.add(segment.id);
            return next;
          });
        }
      }
    },
    [foldMode, streamingId],
  );

  const scrollToEntryId = useCallback(
    (
      entryId: string,
      align: "auto" | "center" | "end" | "start" = "center",
    ): boolean => {
      const turn = turnByEntryId.get(entryId);
      if (!turn) return false;
      const index = turnIndexById.get(turn.id);
      if (index === undefined) return false;
      expandForEntry(turn, entryId);
      rowVirtualizer.scrollToIndex(index, { align });
      // Virtual offsets start below the session header inside the scroller.
      const scroller = getScroller();
      if (scroller) {
        scroller.scrollTop += getContentOffsetTop();
      }
      return true;
    },
    [
      expandForEntry,
      getContentOffsetTop,
      getScroller,
      rowVirtualizer,
      turnByEntryId,
      turnIndexById,
    ],
  );

  useImperativeHandle(
    ref,
    () => ({ scrollToTop, scrollToBottom, scrollToEntryId }),
    [scrollToBottom, scrollToEntryId, scrollToTop],
  );

  // Live follow: while the upstream viewer marks pending scroll-to-bottom, new
  // turns scroll to the exact bottom (virtual estimates cannot land there).
  useEffect(() => {
    if (!pendingScrollToBottomRef?.current) return;
    const rafId = requestAnimationFrame(() => {
      scrollToBottom();
      pendingScrollToBottomRef.current = false;
    });
    return () => cancelAnimationFrame(rafId);
  }, [turns, pendingScrollToBottomRef, scrollToBottom]);

  useEffect(() => {
    if (!scrollTargetId) return;
    // Not loaded yet: this effect re-runs when turns change.
    if (!scrollToEntryId(scrollTargetId, "center")) return;

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
      });
    });

    setScrollTargetId(null);
    return () => cancelAnimationFrame(rafId);
  }, [scrollTargetId, scrollToEntryId, setScrollTargetId]);

  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div className="conversation-preview-messages px-1 py-1">
      <div
        ref={contentRef}
        className="relative w-full"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {virtualRows.map((virtualRow) => {
          const turn = turns[virtualRow.index];
          if (!turn) return null;

          return (
            <div
              key={turn.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom:
                  virtualRow.index === turns.length - 1 ? 0 : TURN_GAP_PX,
              }}
            >
              <ConversationPreviewTurnView
                turn={turn}
                toolResultByCallId={toolResultByCallId}
                searchQuery={searchQuery}
                streamingId={streamingId}
                foldMode={foldMode}
                expanded={expandedTurnIds.has(turn.id)}
                onToggle={() => toggleTurn(turn.id)}
                expandedGroupIds={expandedGroupIds}
                onToggleGroup={toggleGroup}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default ConversationPreviewMessages;
