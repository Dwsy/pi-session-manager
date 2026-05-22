import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Brain,
  Braces,
  Check,
  Code2,
  Copy,
  FileEdit,
  FilePlus,
  FileText,
  Search,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import { CodeView, type CodeViewHandle, type CodeViewItem } from "@pierre/diffs/react";

import type { SessionEntry } from "@/types";
import CodeBlock from "@/components/ui/CodeBlock";
import { useTheme } from "@/hooks/useAppearance";
import {
  DEFAULT_REVIEW_FILTER,
  extractFileOperations,
  formatBytes,
  formatShortPath,
  formatTimestamp,
  getClipboardText,
  getOperationLanguage,
  getOperationTitle,
  getReviewStatus,
  isChangeOperation,
  stringifyArgs,
  type FileOperation,
  type ReviewFilter,
} from "./tool-review/model";
import ReviewFileTree from "./tool-review/ReviewFileTree";
import {
  buildCodeViewItems,
  buildReviewTreeModel,
  getReviewTreePath,
  normalizeReviewPath,
} from "./tool-review/viewModel";

interface ToolCallReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: SessionEntry[];
  toolResultByCallId: Map<string, SessionEntry>;
}

const TOOL_CONFIG: Record<
  string,
  {
    icon: typeof FileText;
    labelKey: string;
    fallbackLabel: string;
    iconClass: string;
    surfaceClass: string;
    borderClass: string;
  }
> = {
  write: {
    icon: FilePlus,
    labelKey: "components.toolCallReview.tools.write",
    fallbackLabel: "Write",
    iconClass: "text-[var(--tool-color-write)]",
    surfaceClass: "bg-surface/55",
    borderClass: "border-border/60",
  },
  edit: {
    icon: FileEdit,
    labelKey: "components.toolCallReview.tools.edit",
    fallbackLabel: "Edit",
    iconClass: "text-[var(--tool-color-edit)]",
    surfaceClass: "bg-surface/55",
    borderClass: "border-border/60",
  },
  read: {
    icon: FileText,
    labelKey: "components.toolCallReview.tools.read",
    fallbackLabel: "Read",
    iconClass: "text-[var(--tool-color-read)]",
    surfaceClass: "bg-surface/55",
    borderClass: "border-border/60",
  },
  bash: {
    icon: Terminal,
    labelKey: "components.toolCallReview.tools.bash",
    fallbackLabel: "Shell",
    iconClass: "text-[var(--tool-color-bash)]",
    surfaceClass: "bg-surface/55",
    borderClass: "border-border/60",
  },
  task: {
    icon: Brain,
    labelKey: "components.toolCallReview.tools.task",
    fallbackLabel: "Task",
    iconClass: "text-[var(--tool-color-write)]",
    surfaceClass: "bg-surface/55",
    borderClass: "border-border/60",
  },
  default: {
    icon: Wrench,
    labelKey: "components.toolCallReview.tools.default",
    fallbackLabel: "Tool",
    iconClass: "text-muted-foreground",
    surfaceClass: "bg-surface/60",
    borderClass: "border-border/70",
  },
};

const FILTER_OPTIONS: Array<{
  id: ReviewFilter;
  labelKey: string;
  fallbackLabel: string;
  predicate: (operation: FileOperation) => boolean;
}> = [
  {
    id: "changes",
    labelKey: "components.toolCallReview.filters.changes",
    fallbackLabel: "Changes",
    predicate: isChangeOperation,
  },
  {
    id: "all",
    labelKey: "components.toolCallReview.filters.all",
    fallbackLabel: "All",
    predicate: () => true,
  },
  {
    id: "reads",
    labelKey: "components.toolCallReview.filters.reads",
    fallbackLabel: "Reads",
    predicate: (operation) => operation.toolName === "read",
  },
  {
    id: "shell",
    labelKey: "components.toolCallReview.filters.shell",
    fallbackLabel: "Shell",
    predicate: (operation) => operation.toolName === "bash",
  },
  {
    id: "errors",
    labelKey: "components.toolCallReview.filters.errors",
    fallbackLabel: "Errors",
    predicate: (operation) => operation.isError,
  },
];

function getToolConfig(toolName: string) {
  return TOOL_CONFIG[toolName] || TOOL_CONFIG.default;
}

function getToolAccent(toolName: string) {
  if (toolName === "write") return "var(--tool-color-write)";
  if (toolName === "edit") return "var(--tool-color-edit)";
  if (toolName === "read") return "var(--tool-color-read)";
  if (toolName === "bash") return "var(--tool-color-bash)";
  if (toolName === "task") return "var(--tool-color-write)";
  return "rgb(var(--color-muted-foreground))";
}

function getReviewAccentStyle(toolName: string): CSSProperties {
  return {
    "--tool-review-accent": getToolAccent(toolName),
  } as CSSProperties;
}

function SummaryItem({
  label,
  fallbackLabel,
  value,
  tone,
}: {
  label: string;
  fallbackLabel: string;
  value: number | string;
  tone: "blue" | "green" | "amber" | "red";
}) {
  const { t } = useTranslation();
  const valueClass =
    tone === "green"
      ? "text-success"
      : tone === "amber"
        ? "text-warning"
        : tone === "red"
          ? "text-destructive"
          : "text-foreground";

  return (
    <div className="border-b border-border/55 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
        {t(label, fallbackLabel)}
      </div>
      <div
        className={`mt-0.5 font-mono text-[13px] font-semibold tabular-nums ${valueClass}`}
      >
        {value}
      </div>
    </div>
  );
}

function FilterBar({
  activeFilter,
  counts,
  onChange,
}: {
  activeFilter: ReviewFilter;
  counts: Record<ReviewFilter, number>;
  onChange: (filter: ReviewFilter) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="grid grid-cols-5 border-b border-border/70 bg-background"
      role="radiogroup"
      aria-label={t("components.toolCallReview.filterLabel", "Review filter")}
    >
      {FILTER_OPTIONS.map((option) => {
        const active = activeFilter === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            role="radio"
            aria-checked={active}
            className={`min-w-0 border-r border-border/35 px-2 py-1.5 text-[11px] font-medium motion-color focus-ring last:border-r-0 ${
              active
                ? "bg-accent/10 text-foreground"
                : "text-muted-foreground hover:bg-surface/55 hover:text-foreground"
            }`}
          >
            <span className="block truncate">
              {t(option.labelKey, option.fallbackLabel)}
            </span>
            <span className="block text-[10px] tabular-nums opacity-70">
              {counts[option.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function InspectorRow({
  label,
  fallbackLabel,
  value,
}: {
  label: string;
  fallbackLabel: string;
  value: string | number;
}) {
  const { t } = useTranslation();

  return (
    <div className="border-b border-border/55 px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {t(label, fallbackLabel)}
      </div>
      <div className="mt-1 break-words text-xs text-foreground">{value}</div>
    </div>
  );
}

function DetailMetric({
  label,
  fallbackLabel,
  value,
  className = "text-foreground",
}: {
  label: string;
  fallbackLabel: string;
  value: string | number;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="border-b border-border/55 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {t(label, fallbackLabel)}
      </div>
      <div className={`mt-1 text-sm font-semibold tabular-nums ${className}`}>
        {value}
      </div>
    </div>
  );
}

function ReviewStatusStrip({
  operation,
  hasPatch,
  hasPrimaryOutput,
}: {
  operation: FileOperation;
  hasPatch: boolean;
  hasPrimaryOutput: boolean;
}) {
  const { t } = useTranslation();
  const status = getReviewStatus(operation, hasPatch, hasPrimaryOutput);
  const impact =
    operation.metrics.additions + operation.metrics.deletions > 0
      ? `+${operation.metrics.additions} / -${operation.metrics.deletions}`
      : operation.metrics.lines > 0
        ? t("components.toolCallReview.lineCount", "{{count}} lines", {
            count: operation.metrics.lines,
          })
        : t("components.toolCallReview.noImpact", "No line impact");

  return (
    <div className="grid gap-2 border-y border-border/60 bg-surface/30 p-2 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 px-1 py-1">
        <div className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          {t("components.toolCallReview.target", "Target")}
        </div>
        <div className="mt-1 truncate font-mono text-xs text-foreground">
          {formatShortPath(normalizeReviewPath(operation.filePath) || operation.filePath)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[auto_auto]">
        <div className={`border px-3 py-2 ${status.className}`}>
          <div className="text-[9px] uppercase tracking-[0.14em] opacity-75">
            {t("components.toolCallReview.statusLabel", "Status")}
          </div>
          <div className="mt-1 whitespace-nowrap text-xs font-semibold">
            {t(status.labelKey, status.fallbackLabel)}
          </div>
        </div>
        <div className="border border-border/50 bg-background/40 px-3 py-2">
          <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            {t("components.toolCallReview.impact", "Impact")}
          </div>
          <div className="mt-1 whitespace-nowrap font-mono text-xs font-semibold text-foreground">
            {impact}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({
  operation,
  codeViewItems,
  selectedOperationId,
  onCopy,
  copied,
}: {
  operation: FileOperation | null;
  codeViewItems: CodeViewItem[];
  selectedOperationId: string | null;
  onCopy: (operation: FileOperation) => void;
  copied: boolean;
}) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const codeViewRef = useRef<CodeViewHandle<undefined>>(null);

  useEffect(() => {
    if (!selectedOperationId || codeViewItems.length === 0) return;
    if (!codeViewItems.some((item) => item.id === selectedOperationId)) return;
    codeViewRef.current?.scrollTo({
      type: "item",
      id: selectedOperationId,
      align: "start",
      behavior: "instant",
    });
  }, [codeViewItems, selectedOperationId]);

  if (!operation) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center border border-border/60 bg-surface/60">
            <FileText
              className="h-6 w-6 text-muted-foreground/55"
              aria-hidden="true"
            />
          </div>
          <div className="mt-3 text-sm font-medium text-foreground">
            {t(
              "components.toolCallReview.emptySelection",
              "Select an operation to review",
            )}
          </div>
        </div>
      </div>
    );
  }

  const config = getToolConfig(operation.toolName);
  const Icon = config.icon;
  const language = getOperationLanguage(operation);
  const argsText = stringifyArgs(operation.args);
  const displayPath = operation.toolName === "bash"
    ? operation.filePath
    : normalizeReviewPath(operation.filePath) || operation.filePath;
  const commandText = operation.toolName === "bash" ? operation.filePath : "";
  const hasCodeViewOutput = codeViewItems.length > 0;
  const hasPrimaryOutput = Boolean(
    hasCodeViewOutput ||
    operation.content ||
    operation.output ||
    operation.diff,
  );
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const rootIsDark = document.documentElement.classList.contains("theme-dark");
  const themeType =
    theme === "dark" || rootIsDark || (theme === "system" && prefersDark)
      ? "dark"
      : "light";

  return (
    <div
      className="flex min-w-0 flex-1 flex-col bg-background"
      style={getReviewAccentStyle(operation.toolName)}
    >
      <div className="relative flex min-h-[44px] flex-shrink-0 items-center gap-2 border-b border-border/70 bg-surface/30 px-3 py-1.5">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-80"
          style={{
            background:
              "linear-gradient(90deg, var(--tool-review-accent), transparent 58%)",
          }}
        />
        <Icon
          className={`h-4 w-4 flex-shrink-0 ${config.iconClass}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {getOperationTitle(operation)}
            </span>
            <span className="border border-border/50 bg-background/45 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {t(config.labelKey, config.fallbackLabel)}
            </span>
            {operation.isError && (
              <span className="inline-flex items-center gap-1 border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-destructive">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {t("components.toolCallReview.error", "Error")}
              </span>
            )}
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {displayPath}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onCopy(operation)}
          aria-label={t(
            "components.toolCallReview.copyOperation",
            "Copy operation details",
          )}
          className="inline-flex items-center gap-1.5 border border-border/60 bg-background/70 px-2.5 py-1.5 text-xs text-muted-foreground motion-color focus-ring hover:border-border-hover hover:bg-surface hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied
            ? t("components.codeBlock.copied", "Copied!")
            : t("components.codeBlock.copy", "Copy")}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="custom-scrollbar min-w-0 flex-1 overflow-auto">
          <div className="space-y-3 bg-background p-3">
            {isChangeOperation(operation) && (
              <ReviewStatusStrip
                operation={operation}
                hasPatch={hasCodeViewOutput}
                hasPrimaryOutput={hasPrimaryOutput}
              />
            )}

            <div className="grid grid-cols-2 border-y border-border/60 sm:grid-cols-4">
              <DetailMetric
                label="components.toolCallReview.sequence"
                fallbackLabel="Sequence"
                value={`#${operation.sequence}`}
              />
              <DetailMetric
                label="components.toolCallReview.size"
                fallbackLabel="Size"
                value={formatBytes(operation.metrics.bytes)}
              />
              <DetailMetric
                label="components.toolCallReview.additions"
                fallbackLabel="Additions"
                value={`+${operation.metrics.additions}`}
                className="text-success"
              />
              <DetailMetric
                label="components.toolCallReview.deletions"
                fallbackLabel="Deletions"
                value={`-${operation.metrics.deletions}`}
                className="text-destructive"
              />
            </div>

            {isChangeOperation(operation) && hasCodeViewOutput ? (
              <div className="min-h-[620px] overflow-hidden border border-border/70 bg-background">
                <CodeView
                  ref={codeViewRef}
                  key={codeViewItems.map((item) => item.id).join(":")}
                  items={codeViewItems}
                  className="h-[min(960px,calc(94dvh-168px))] min-h-[620px] bg-background"
                  options={{
                    theme: { dark: "pierre-dark", light: "pierre-light" },
                    themeType,
                    diffStyle: "split",
                    overflow: "scroll",
                    stickyHeaders: true,
                    hunkSeparators: "line-info",
                    itemMetrics: {
                      lineHeight: 20,
                      diffHeaderHeight: 36,
                    },
                    layout: {
                      paddingTop: 0,
                      paddingBottom: 12,
                      gap: 8,
                    },
                  }}
                />
              </div>
            ) : operation.toolName === "bash" ? (
              <div className="space-y-3">
                <div className="overflow-hidden border border-border/70 bg-background">
                  <div className="flex items-center gap-2 border-b border-border/45 bg-background/25 px-3 py-2 text-xs font-medium text-foreground">
                    <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("components.bashExecution.command", "Command")}
                  </div>
                  <CodeBlock
                    code={commandText}
                    language="bash"
                    maxHeight={180}
                    scrollable
                  />
                </div>
                {operation.output && (
                  <div className="overflow-hidden border border-border/70 bg-background">
                    <div className="flex items-center gap-2 border-b border-border/45 bg-background/25 px-3 py-2 text-xs font-medium text-foreground">
                      <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {operation.isError
                        ? t(
                            "components.toolCallReview.errorOutput",
                            "Error output",
                          )
                        : t("components.bashExecution.output", "Output")}
                    </div>
                    <CodeBlock
                      code={operation.output}
                      language="text"
                      maxHeight={520}
                      scrollable
                    />
                  </div>
                )}
              </div>
            ) : operation.diff ? (
              <div className="overflow-hidden border border-border/70 bg-background">
                <CodeBlock
                  code={operation.diff}
                  language="diff"
                  maxHeight={680}
                  scrollable
                />
              </div>
            ) : operation.content ? (
              <div className="overflow-hidden border border-border/70 bg-background">
                <CodeBlock
                  code={operation.content}
                  language={language}
                  maxHeight={680}
                  scrollable
                />
              </div>
            ) : operation.output ? (
              <div className="overflow-hidden border border-border/70 bg-background">
                <CodeBlock
                  code={operation.output}
                  language={language || "text"}
                  maxHeight={680}
                  scrollable
                />
              </div>
            ) : (
              <div className="border border-border/70 bg-background p-6 text-center text-sm text-muted-foreground">
                {t(
                  "components.toolCallReview.noRenderableOutput",
                  "No renderable output was captured for this operation.",
                )}
              </div>
            )}

            {!hasPrimaryOutput && (
              <div className="border border-border/70 bg-background">
                <CodeBlock
                  code={argsText}
                  language="json"
                  maxHeight={360}
                  scrollable
                />
              </div>
            )}
          </div>
        </div>

        <aside className="hidden w-56 flex-shrink-0 flex-col border-l border-border/70 bg-surface/25 xl:flex">
          <div className="flex items-center gap-2 border-b border-border/70 bg-surface/35 px-3 py-2 text-xs font-semibold text-foreground">
            <Braces
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            {t("components.toolCallReview.inspector", "Inspector")}
          </div>
          <InspectorRow
            label="components.toolCallReview.entry"
            fallbackLabel="Entry"
            value={operation.entryId}
          />
          <InspectorRow
            label="components.toolCallReview.sequence"
            fallbackLabel="Sequence"
            value={`#${operation.sequence}`}
          />
          <InspectorRow
            label="components.toolCallReview.time"
            fallbackLabel="Time"
            value={formatTimestamp(operation.timestamp) || "-"}
          />
          <InspectorRow
            label="components.toolCallReview.size"
            fallbackLabel="Size"
            value={formatBytes(operation.metrics.bytes)}
          />
          {operation.metrics.additions > 0 && (
            <InspectorRow
              label="components.toolCallReview.additions"
              fallbackLabel="Additions"
              value={`+${operation.metrics.additions}`}
            />
          )}
          {operation.metrics.deletions > 0 && (
            <InspectorRow
              label="components.toolCallReview.deletions"
              fallbackLabel="Deletions"
              value={`-${operation.metrics.deletions}`}
            />
          )}
          <div className="min-h-0 flex-1 overflow-hidden border-t border-border/70 bg-background/55">
            <div className="border-b border-border/40 px-3 py-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              {t("components.toolCall.arguments", "Arguments")}
            </div>
            <div className="custom-scrollbar max-h-full overflow-auto">
              <CodeBlock
                code={argsText}
                language="json"
                maxHeight={360}
                scrollable
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function ToolCallReviewModal({
  isOpen,
  onClose,
  entries,
  toolResultByCallId,
}: ToolCallReviewModalProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>(DEFAULT_REVIEW_FILTER);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const allOperations = useMemo(
    () => extractFileOperations(entries, toolResultByCallId),
    [entries, toolResultByCallId],
  );
  const filterCounts = useMemo(() => {
    return FILTER_OPTIONS.reduce(
      (acc, option) => {
        acc[option.id] = allOperations.filter(option.predicate).length;
        return acc;
      },
      {} as Record<ReviewFilter, number>,
    );
  }, [allOperations]);

  const filteredOperations = useMemo(() => {
    const option = FILTER_OPTIONS.find((item) => item.id === activeFilter);
    return option ? allOperations.filter(option.predicate) : allOperations;
  }, [activeFilter, allOperations]);

  const treeModel = useMemo(
    () => buildReviewTreeModel(filteredOperations),
    [filteredOperations],
  );

  const selectedOperation = useMemo(
    () =>
      allOperations.find((operation) => operation.id === selectedId) || null,
    [allOperations, selectedId],
  );

  const selectedFileOperations = useMemo(() => {
    if (!selectedOperation) return [];
    const selectedPath = getReviewTreePath(selectedOperation);
    return filteredOperations.filter(
      (operation) => getReviewTreePath(operation) === selectedPath,
    );
  }, [filteredOperations, selectedOperation]);

  const selectedCodeViewItems = useMemo(
    () => buildCodeViewItems(selectedFileOperations),
    [selectedFileOperations],
  );

  const selectedTreePath = selectedOperation
    ? getReviewTreePath(selectedOperation)
    : null;

  const totals = useMemo(() => {
    return allOperations.reduce(
      (acc, operation) => {
        acc.additions += operation.metrics.additions;
        acc.deletions += operation.metrics.deletions;
        if (operation.isError) acc.errors += 1;
        if (isChangeOperation(operation)) acc.changes += 1;
        return acc;
      },
      { additions: 0, deletions: 0, errors: 0, changes: 0 },
    );
  }, [allOperations]);

  useEffect(() => {
    if (!isOpen) return;
    if (
      activeFilter === "changes" &&
      filterCounts.changes === 0 &&
      allOperations.length > 0
    ) {
      setActiveFilter("all");
    }
  }, [activeFilter, allOperations.length, filterCounts.changes, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (filteredOperations.length === 0) {
      setSelectedId(null);
      return;
    }

    if (
      !selectedId ||
      !filteredOperations.some((operation) => operation.id === selectedId)
    ) {
      setSelectedId(filteredOperations[0].id);
    }
  }, [filteredOperations, isOpen, selectedId]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, [contenteditable='true']")
      ) {
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (filteredOperations.length === 0) return;

      event.preventDefault();
      const currentIndex = filteredOperations.findIndex(
        (operation) => operation.id === selectedId,
      );
      const nextIndex =
        event.key === "ArrowDown"
          ? Math.min(filteredOperations.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
      setSelectedId(
        filteredOperations[nextIndex]?.id ?? filteredOperations[0].id,
      );
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [filteredOperations, isOpen, onClose, selectedId]);

  const handleTreeSelect = useCallback(
    (path: string) => {
      const operation = filteredOperations.find(
        (candidate) => getReviewTreePath(candidate) === path,
      );
      if (operation) setSelectedId(operation.id);
    },
    [filteredOperations],
  );

  const handleCopy = useCallback(async (operation: FileOperation) => {
    try {
      await navigator.clipboard.writeText(getClipboardText(operation));
      setCopiedId(operation.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch (error) {
      console.error("[ToolCallReviewModal] Failed to copy operation:", error);
    }
  }, []);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/55 p-2 backdrop-blur-xl"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex h-[min(1200px,94dvh)] w-[min(1960px,96vw)] max-h-[calc(100dvh-16px)] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-sm border border-border/80 bg-background text-foreground shadow-none"
        role="dialog"
        data-tool-call-review-modal="true"
        aria-modal="true"
        aria-labelledby="tool-call-review-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="relative flex min-h-[38px] flex-shrink-0 items-center gap-2 border-b border-border/80 bg-surface/35 px-3 py-1.5">
          <div className="min-w-0 flex-1">
            <h2
              id="tool-call-review-title"
              className="text-[13px] font-semibold text-foreground"
            >
              {t("components.toolCallReview.title", "Tool Call Review")}
            </h2>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
              <span>
                {t("components.toolCallReview.operationCount", "{{count}} operations", {
                  count: allOperations.length,
                })}
              </span>
              <span>
                {t("components.toolCallReview.entryCount", "{{count}} entries", {
                  count: entries.length,
                })}
              </span>
              <span>
                {totals.changes} {t("components.toolCallReview.summary.changes", "Changes")}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="relative p-1.5 text-muted-foreground motion-color focus-ring hover:bg-surface hover:text-foreground"
            aria-label={t("common.close", "Close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {allOperations.length === 0 ? (
          <div className="flex flex-1 items-center justify-center bg-background">
            <div className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center border border-border/60 bg-surface/60">
                <Wrench
                  className="h-6 w-6 text-muted-foreground/50"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-3 text-sm font-medium text-foreground">
                {t(
                  "components.toolCallReview.empty",
                  "No reviewable tool calls found",
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <aside className="flex min-h-[260px] flex-shrink-0 flex-col border-b border-border/80 bg-background md:w-[320px] md:border-b-0 md:border-r">
              <div className="border-b border-border/70 bg-background">
                <FilterBar
                  activeFilter={activeFilter}
                  counts={filterCounts}
                  onChange={setActiveFilter}
                />
              </div>
              <div className="min-h-0 flex-1 bg-background">
                {filteredOperations.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-5 py-8 text-center">
                    <div>
                      <Search
                        className="mx-auto h-8 w-8 text-muted-foreground/50"
                        aria-hidden="true"
                      />
                      <div className="mt-3 text-sm font-medium text-foreground">
                        {t(
                          "components.toolCallReview.noFilterResults",
                          "No operations match this filter",
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <ReviewFileTree
                    tree={treeModel}
                    selectedPath={selectedTreePath}
                    onSelectPath={handleTreeSelect}
                    ariaLabel={t(
                      "components.toolCallReview.operationList",
                      "Reviewable operations",
                    )}
                  />
                )}
              </div>
              <div className="grid grid-cols-4 border-t border-border/70 bg-surface/25 divide-x divide-border/45">
                <SummaryItem
                  label="components.toolCallReview.summary.changes"
                  fallbackLabel="Changes"
                  value={totals.changes}
                  tone="blue"
                />
                <SummaryItem
                  label="components.toolCallReview.summary.add"
                  fallbackLabel="Add"
                  value={totals.additions.toLocaleString()}
                  tone="green"
                />
                <SummaryItem
                  label="components.toolCallReview.summary.del"
                  fallbackLabel="Del"
                  value={totals.deletions.toLocaleString()}
                  tone="amber"
                />
                <SummaryItem
                  label="components.toolCallReview.summary.err"
                  fallbackLabel="Err"
                  value={totals.errors}
                  tone="red"
                />
              </div>
            </aside>

            <DetailPanel
              operation={selectedOperation}
              codeViewItems={selectedCodeViewItems}
              selectedOperationId={selectedOperation?.id ?? null}
              onCopy={handleCopy}
              copied={
                selectedOperation ? copiedId === selectedOperation.id : false
              }
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
