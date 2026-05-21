import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Brain,
  Braces,
  Check,
  Clock,
  Code2,
  Copy,
  FileEdit,
  FilePlus,
  FileText,
  Hash,
  ListFilter,
  Search,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import {
  MultiFileDiff,
  PatchDiff,
  type FileContents,
} from "@pierre/diffs/react";

import type { Content, SessionEntry } from "@/types";
import CodeBlock from "@/components/ui/CodeBlock";
import { useTheme } from "@/hooks/useAppearance";
import { defaultResolveData } from "@/plugins/tools-render/utils/resolveData";
import { getLanguageFromPath } from "@/utils/markdown";

interface ToolCallReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: SessionEntry[];
  toolResultByCallId: Map<string, SessionEntry>;
}

export interface OperationMetrics {
  additions: number;
  deletions: number;
  lines: number;
  bytes: number;
}

export interface FileOperation {
  id: string;
  entryId: string;
  sequence: number;
  toolName: string;
  filePath: string;
  content?: string;
  output?: string;
  diff?: string;
  args: Record<string, unknown>;
  isError: boolean;
  timestamp: string;
  preview: string;
  metrics: OperationMetrics;
}

export type ReviewFilter = "all" | "changes" | "reads" | "shell" | "errors";

export const DEFAULT_REVIEW_FILTER: ReviewFilter = "all";

const EMPTY_METRICS: OperationMetrics = {
  additions: 0,
  deletions: 0,
  lines: 0,
  bytes: 0,
};

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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getStringArg(
  args: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return "";
}

function stringifyArgs(args: Record<string, unknown>) {
  try {
    return JSON.stringify(args, null, 2) || "{}";
  } catch {
    return "{}";
  }
}

function countLines(value: string) {
  if (!value) return 0;
  return value.endsWith("\n")
    ? value.split("\n").length - 1
    : value.split("\n").length;
}

function getBytes(value: string) {
  return new Blob([value]).size;
}

function parseDiffMetrics(
  diff: string,
): Pick<OperationMetrics, "additions" | "deletions"> {
  let additions = 0;
  let deletions = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }

  return { additions, deletions };
}

function buildMetrics(
  toolName: string,
  content: string,
  output: string,
  diff: string,
): OperationMetrics {
  if (diff) {
    const { additions, deletions } = parseDiffMetrics(diff);
    return {
      additions,
      deletions,
      lines: Math.max(additions + deletions, countLines(diff)),
      bytes: getBytes(diff),
    };
  }

  const text = content || output;
  if (!text) return EMPTY_METRICS;

  return {
    additions: toolName === "write" ? countLines(text) : 0,
    deletions: 0,
    lines: countLines(text),
    bytes: getBytes(text),
  };
}

function firstMeaningfulLine(value: string) {
  return (
    value
      .split("\n")
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length > 0 &&
          !line.startsWith("@@") &&
          !line.startsWith("diff --git"),
      ) || ""
  );
}

function getOperationPreview(
  toolName: string,
  args: Record<string, unknown>,
  output: string,
  content: string,
  diff: string,
) {
  if (toolName === "bash") {
    return getStringArg(args, "command").replace(/\s+/g, " ").trim();
  }

  if (diff) return firstMeaningfulLine(diff);
  if (content) return firstMeaningfulLine(content);
  if (output) return firstMeaningfulLine(output);

  return stringifyArgs(args).replace(/\s+/g, " ").slice(0, 160);
}

function getOperationPath(toolName: string, args: Record<string, unknown>) {
  if (toolName === "bash") {
    return getStringArg(args, "command") || "Shell command";
  }

  return (
    getStringArg(args, "file_path", "path", "notebook_path", "absolute_path") ||
    getStringArg(args, "description") ||
    "Unknown target"
  );
}

function getPathBasename(path: string) {
  return path.split("/").filter(Boolean).pop() || path || "file";
}

function getOperationTitle(operation: FileOperation) {
  if (operation.toolName === "bash") return "Shell command";
  return getPathBasename(operation.filePath);
}

function getOperationScope(operation: FileOperation) {
  if (operation.toolName === "bash") {
    return operation.filePath;
  }

  const parts = operation.filePath.split("/").filter(Boolean);
  if (parts.length <= 1) return operation.filePath;
  return parts.slice(0, -1).join("/");
}

function isChangeOperation(operation: FileOperation) {
  return operation.toolName === "write" || operation.toolName === "edit";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatShortPath(path: string) {
  if (!path || path === "Unknown target") return path;
  if (path.length <= 64) return path;
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 3) return path;
  return `.../${parts.slice(-3).join("/")}`;
}

function normalizeDiffPath(path: string) {
  const trimmed = path.trim();
  return trimmed && trimmed !== "Unknown target" ? trimmed : "untitled";
}

function isUnifiedDiff(value: string) {
  return (
    /(^|\n)@@ /.test(value) &&
    (/(^|\n)--- /.test(value) || value.includes("diff --git"))
  );
}

function makeNewFilePatch(path: string, content: string) {
  if (!content) return "";
  const lines = content.split("\n");
  return [
    "--- /dev/null",
    `+++ b/${normalizeDiffPath(path)}`,
    `@@ -0,0 +1,${Math.max(1, lines.length)} @@`,
    lines.map((line) => `+${line}`).join("\n"),
  ].join("\n");
}

function getOperationPatch(operation: FileOperation) {
  if (operation.diff && isUnifiedDiff(operation.diff)) {
    return operation.diff;
  }

  if (operation.toolName === "write" && operation.content) {
    return makeNewFilePatch(operation.filePath, operation.content);
  }

  return "";
}

function parsePiDiff(
  diffText: string,
): { oldText: string; newText: string } | null {
  if (!diffText) return null;

  const lines = diffText.split("\n");
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let sawMarkedLine = false;

  for (const line of lines) {
    if (line.trim() === "...") continue;
    if (line.trim() === "") {
      oldLines.push("");
      newLines.push("");
      continue;
    }

    const lineMatch = line.match(/^([+-]?)\s*\d+\s+(.*)$/);
    if (!lineMatch) continue;

    sawMarkedLine = true;
    const [, marker, content] = lineMatch;
    if (marker === "-") {
      oldLines.push(content);
    } else if (marker === "+") {
      newLines.push(content);
    } else {
      oldLines.push(content);
      newLines.push(content);
    }
  }

  if (!sawMarkedLine) return null;

  return {
    oldText: oldLines.join("\n"),
    newText: newLines.join("\n"),
  };
}

function getEditFileContents(operation: FileOperation): {
  oldFile: FileContents;
  newFile: FileContents;
} | null {
  const fileName = getPathBasename(operation.filePath);
  const oldString = getStringArg(
    operation.args,
    "old_string",
    "oldStr",
    "before",
  );
  const newString = getStringArg(
    operation.args,
    "new_string",
    "newStr",
    "after",
  );

  if (oldString || newString) {
    return {
      oldFile: { name: fileName, contents: oldString },
      newFile: { name: fileName, contents: newString },
    };
  }

  if (operation.diff) {
    const parsed = parsePiDiff(operation.diff);
    if (parsed) {
      return {
        oldFile: { name: fileName, contents: parsed.oldText },
        newFile: { name: fileName, contents: parsed.newText },
      };
    }
  }

  return null;
}

function getWriteFileContents(operation: FileOperation): {
  oldFile: FileContents;
  newFile: FileContents;
} | null {
  if (!operation.content) return null;
  const fileName = getPathBasename(operation.filePath);
  return {
    oldFile: { name: fileName, contents: "" },
    newFile: { name: fileName, contents: operation.content },
  };
}

function getOperationFileDiff(operation: FileOperation) {
  if (operation.toolName === "edit") {
    return getEditFileContents(operation);
  }
  if (operation.toolName === "write") {
    return getWriteFileContents(operation);
  }
  return null;
}

function getOperationLanguage(operation: FileOperation) {
  if (operation.toolName === "bash") return "bash";
  return getLanguageFromPath(operation.filePath);
}

function getClipboardText(operation: FileOperation) {
  if (operation.toolName === "bash") {
    return operation.output
      ? `${operation.filePath}\n\n${operation.output}`
      : operation.filePath;
  }

  return (
    operation.diff ||
    operation.content ||
    operation.output ||
    stringifyArgs(operation.args)
  );
}

function getReviewStatus(
  operation: FileOperation,
  hasPatch: boolean,
  hasPrimaryOutput: boolean,
) {
  if (operation.isError) {
    return {
      labelKey: "components.toolCallReview.status.error",
      fallbackLabel: "Needs attention",
      className: "border-destructive/25 bg-destructive/10 text-destructive",
    };
  }

  if (hasPatch || isChangeOperation(operation)) {
    return {
      labelKey: "components.toolCallReview.status.change",
      fallbackLabel: "Change review",
      className: "border-success/25 bg-success/10 text-success",
    };
  }

  if (hasPrimaryOutput) {
    return {
      labelKey: "components.toolCallReview.status.captured",
      fallbackLabel: "Captured output",
      className: "border-info/25 bg-info/10 text-info",
    };
  }

  return {
    labelKey: "components.toolCallReview.status.metadata",
    fallbackLabel: "Metadata only",
    className: "border-border/45 bg-surface/40 text-muted-foreground",
  };
}

export function extractFileOperations(
  entries: SessionEntry[],
  toolResultByCallId: Map<string, SessionEntry>,
): FileOperation[] {
  const operations: FileOperation[] = [];

  entries.forEach((entry) => {
    const content = entry.message?.content;
    if (!Array.isArray(content)) return;

    content.forEach((item: Content, itemIndex) => {
      if (item.type !== "toolCall") return;

      const toolCall = item as Content & {
        type: "toolCall";
        id?: string;
        name?: string;
        arguments?: Record<string, unknown>;
      };
      const toolName = (toolCall.name || "unknown").toLowerCase();
      if (!["write", "edit", "read", "bash", "task"].includes(toolName)) return;

      const resolved = defaultResolveData(
        toolCall,
        itemIndex,
        toolResultByCallId,
      );
      const args = asRecord(resolved.args ?? toolCall.arguments);
      const output = typeof resolved.output === "string" ? resolved.output : "";
      const diff = typeof resolved.diff === "string" ? resolved.diff : "";
      const contentArg = getStringArg(args, "content", "new_string");
      const filePath = getOperationPath(toolName, args);
      const preview = getOperationPreview(
        toolName,
        args,
        output,
        contentArg,
        diff,
      );

      operations.push({
        id: `${entry.id}-${toolCall.id || operations.length}`,
        entryId: entry.id,
        sequence: operations.length + 1,
        toolName,
        filePath,
        content: contentArg || undefined,
        output: output || undefined,
        diff: diff || undefined,
        args,
        isError: Boolean(resolved.isError),
        timestamp: entry.timestamp,
        preview,
        metrics: buildMetrics(toolName, contentArg, output, diff),
      });
    });
  });

  return operations;
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
    <div className="border-b border-border/55 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
        {t(label, fallbackLabel)}
      </div>
      <div
        className={`mt-1 font-mono text-[14px] font-semibold tabular-nums ${valueClass}`}
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
                ? "bg-accent/10 text-foreground shadow-[inset_0_-2px_0_var(--accent)]"
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

function OperationCard({
  operation,
  selected,
  onSelect,
}: {
  operation: FileOperation;
  selected: boolean;
  onSelect: (operation: FileOperation) => void;
}) {
  const { t } = useTranslation();
  const config = getToolConfig(operation.toolName);
  const Icon = config.icon;
  const time = formatTimestamp(operation.timestamp);
  const title = getOperationTitle(operation);
  const scope = getOperationScope(operation);
  const hasLineMetrics =
    operation.metrics.additions > 0 || operation.metrics.deletions > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(operation)}
      role="option"
      aria-selected={selected}
      style={getReviewAccentStyle(operation.toolName)}
      className={`group relative w-full overflow-hidden border-b border-border/55 px-3 py-2 text-left motion-color focus-ring ${
        selected
          ? "bg-accent/10 [box-shadow:inset_2px_0_0_var(--tool-review-accent)]"
          : "bg-transparent hover:bg-surface/55"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-px"
        style={{ background: "var(--tool-review-accent)" }}
      />
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">
          #{operation.sequence}
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Icon
              className={`h-3.5 w-3.5 flex-shrink-0 ${config.iconClass}`}
              aria-hidden="true"
            />
            <span className="truncate text-[13px] font-medium text-foreground">
              {title}
            </span>
            {operation.isError && (
              <AlertTriangle
                className="h-3.5 w-3.5 flex-shrink-0 text-destructive"
                aria-label={t("components.toolCallReview.error", "Error")}
              />
            )}
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground/75">
            {formatShortPath(scope)}
          </div>
          {operation.preview && (
            <div className="mt-1 line-clamp-1 text-[11px] leading-4 text-muted-foreground/75">
              {operation.preview}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-[10px] text-muted-foreground/80">
          <span className="uppercase tracking-[0.08em]">
            {t(config.labelKey, config.fallbackLabel)}
          </span>
          <span className="font-mono tabular-nums">
            {hasLineMetrics ? (
              <>
                {operation.metrics.additions > 0 && (
                  <span className="text-success">+{operation.metrics.additions}</span>
                )}
                {operation.metrics.additions > 0 && operation.metrics.deletions > 0 && (
                  <span className="mx-1 text-muted-foreground/45">/</span>
                )}
                {operation.metrics.deletions > 0 && (
                  <span className="text-destructive">-{operation.metrics.deletions}</span>
                )}
              </>
            ) : time ? (
              time
            ) : (
              t("components.toolCallReview.lineCount", "{{count}} lines", {
                count: operation.metrics.lines,
              })
            )}
          </span>
        </div>
      </div>
    </button>
  );
}

function OperationList({
  operations,
  selectedId,
  onSelect,
  emptyLabel,
}: {
  operations: FileOperation[];
  selectedId: string | null;
  onSelect: (operation: FileOperation) => void;
  emptyLabel: string;
}) {
  const { t } = useTranslation();

  if (operations.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-5 py-8 text-center">
        <div>
          <Search
            className="mx-auto h-8 w-8 text-muted-foreground/50"
            aria-hidden="true"
          />
          <div className="mt-3 text-sm font-medium text-foreground">
            {emptyLabel}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="custom-scrollbar flex-1 overflow-y-auto bg-background"
      role="listbox"
      aria-label={t(
        "components.toolCallReview.operationList",
        "Reviewable operations",
      )}
    >
      {operations.map((operation) => (
        <OperationCard
          key={operation.id}
          operation={operation}
          selected={operation.id === selectedId}
          onSelect={onSelect}
        />
      ))}
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
          {formatShortPath(operation.filePath)}
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
  onCopy,
  copied,
}: {
  operation: FileOperation | null;
  onCopy: (operation: FileOperation) => void;
  copied: boolean;
}) {
  const { t } = useTranslation();
  const { theme } = useTheme();

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
  const patch = getOperationPatch(operation);
  const fileDiff = getOperationFileDiff(operation);
  const language = getOperationLanguage(operation);
  const argsText = stringifyArgs(operation.args);
  const commandText = operation.toolName === "bash" ? operation.filePath : "";
  const hasPrimaryOutput = Boolean(
    fileDiff ||
    patch ||
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
      <div className="relative flex min-h-[48px] flex-shrink-0 items-center gap-2 border-b border-border/70 bg-surface/55 px-3 py-2">
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
            {operation.filePath}
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
                hasPatch={Boolean(fileDiff || patch)}
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

            {fileDiff ? (
              <div className="overflow-hidden border border-border/70 bg-background">
                <div className="flex items-center justify-between border-b border-border/45 bg-background/25 px-3 py-2">
                  <div className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
                    <FileEdit
                      className="h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {operation.toolName === "write"
                      ? t(
                          "components.toolCallReview.writtenContent",
                          "Written content",
                        )
                      : t(
                          "components.toolCallReview.updatedContent",
                          "Updated content",
                        )}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {formatShortPath(operation.filePath)}
                  </div>
                </div>
                <MultiFileDiff
                  oldFile={fileDiff.oldFile}
                  newFile={fileDiff.newFile}
                  options={{
                    theme: { dark: "pierre-dark", light: "pierre-light" },
                    themeType,
                    diffStyle: "split",
                    overflow: "wrap",
                  }}
                />
              </div>
            ) : patch ? (
              <div className="overflow-hidden border border-border/70 bg-background">
                <div className="flex items-center justify-between border-b border-border/45 bg-background/25 px-3 py-2">
                  <div className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
                    <FileEdit
                      className="h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {t("components.toolCallReview.patch", "Patch")}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {formatShortPath(operation.filePath)}
                  </div>
                </div>
                <PatchDiff
                  patch={patch}
                  options={{
                    theme: { dark: "pierre-dark", light: "pierre-light" },
                    themeType,
                    diffStyle: "split",
                    overflow: "wrap",
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

        <aside className="hidden w-64 flex-shrink-0 flex-col border-l border-border/70 bg-surface/45 xl:flex">
          <div className="flex items-center gap-2 border-b border-border/70 bg-card/60 px-3 py-2 text-xs font-semibold text-foreground">
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

  const selectedOperation = useMemo(
    () =>
      allOperations.find((operation) => operation.id === selectedId) || null,
    [allOperations, selectedId],
  );

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
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable='true']")) return;

      if (event.key === "Escape") {
        onClose();
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

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredOperations, isOpen, onClose, selectedId]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 backdrop-blur-xl sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex h-[min(1200px,80vh)] w-[min(1880px,80vw)] max-h-[calc(100dvh-32px)] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-sm border border-border/80 bg-background text-foreground shadow-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tool-call-review-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="relative flex min-h-[42px] flex-shrink-0 items-center gap-2 border-b border-border/80 bg-surface/55 px-3 py-2">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-border/70" />
          <ListFilter className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2
              id="tool-call-review-title"
              className="text-[13px] font-semibold text-foreground"
            >
              {t("components.toolCallReview.title", "Tool Call Review")}
            </h2>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5" aria-hidden="true" />
                {t(
                  "components.toolCallReview.operationCount",
                  "{{count}} operations",
                  {
                    count: allOperations.length,
                  },
                )}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {t(
                  "components.toolCallReview.entryCount",
                  "{{count}} entries",
                  {
                    count: entries.length,
                  },
                )}
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
            <aside className="flex min-h-[260px] flex-shrink-0 flex-col border-b border-border/80 bg-background md:w-[360px] md:border-b-0 md:border-r">
              <div className="border-b border-border/70 bg-surface/35">
                <div className="grid grid-cols-4 border-b border-border/60 divide-x divide-border/45">
                  <SummaryItem
                    label="components.toolCallReview.summary.changes"
                    fallbackLabel="Changes"
                    value={totals.changes}
                    tone="blue"
                  />
                  <SummaryItem
                    label="components.toolCallReview.summary.add"
                    fallbackLabel="Add"
                    value={`+${totals.additions}`}
                    tone="green"
                  />
                  <SummaryItem
                    label="components.toolCallReview.summary.del"
                    fallbackLabel="Del"
                    value={`-${totals.deletions}`}
                    tone="amber"
                  />
                  <SummaryItem
                    label="components.toolCallReview.summary.err"
                    fallbackLabel="Err"
                    value={totals.errors}
                    tone="red"
                  />
                </div>
                <FilterBar
                  activeFilter={activeFilter}
                  counts={filterCounts}
                  onChange={setActiveFilter}
                />
              </div>
              <OperationList
                operations={filteredOperations}
                selectedId={selectedId}
                onSelect={(operation) => setSelectedId(operation.id)}
                emptyLabel={t(
                  "components.toolCallReview.noFilterResults",
                  "No operations match this filter",
                )}
              />
            </aside>

            <DetailPanel
              operation={selectedOperation}
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
