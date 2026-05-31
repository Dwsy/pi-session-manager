import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Brain,
  Braces,
  Check,
  Code2,
  Columns2,
  Copy,
  FileEdit,
  FilePlus,
  FileText,
  Files,
  Loader2,
  Maximize2,
  Minimize2,
  Rows3,
  Search,
  Terminal,
  UnfoldVertical,
  WrapText,
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
  loading?: boolean;
  error?: string | null;
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
  icon: typeof FileText;
  labelKey: string;
  fallbackLabel: string;
  predicate: (operation: FileOperation) => boolean;
}> = [
  {
    id: "all",
    icon: Wrench,
    labelKey: "components.toolCallReview.filters.all",
    fallbackLabel: "All",
    predicate: () => true,
  },
  {
    id: "changes",
    icon: FileEdit,
    labelKey: "components.toolCallReview.filters.changes",
    fallbackLabel: "Changes",
    predicate: isChangeOperation,
  },
  {
    id: "reads",
    icon: FileText,
    labelKey: "components.toolCallReview.filters.reads",
    fallbackLabel: "Reads",
    predicate: (operation) => operation.toolName === "read",
  },
  {
    id: "errors",
    icon: AlertTriangle,
    labelKey: "components.toolCallReview.filters.errors",
    fallbackLabel: "Errors",
    predicate: (operation) => operation.isError,
  },
];

type ReviewMode = "files" | "shell";

const REVIEW_MODE_OPTIONS: Array<{
  id: ReviewMode;
  icon: typeof FileText;
  labelKey: string;
  fallbackLabel: string;
  predicate: (operation: FileOperation) => boolean;
}> = [
  {
    id: "files",
    icon: Files,
    labelKey: "components.toolCallReview.modes.files",
    fallbackLabel: "Files",
    predicate: (operation) => operation.toolName !== "bash",
  },
  {
    id: "shell",
    icon: Terminal,
    labelKey: "components.toolCallReview.modes.shell",
    fallbackLabel: "Shell",
    predicate: (operation) => operation.toolName === "bash",
  },
];

const REVIEW_CODE_VIEW_STYLE = {
  "--diffs-light-bg": "rgb(var(--color-background))",
  "--diffs-dark-bg": "rgb(var(--color-background))",
  "--diffs-light": "rgb(var(--color-foreground))",
  "--diffs-dark": "rgb(var(--color-foreground))",
  "--diffs-bg-context-override": "var(--bg-inset)",
  "--diffs-bg-context-gutter-override": "rgb(var(--color-surface-dark) / 0.52)",
  "--diffs-bg-separator-override": "rgb(var(--color-surface-dark) / 0.72)",
  "--diffs-bg-buffer-override": "rgb(var(--color-surface-dark) / 0.42)",
  "--diffs-fg-number-override": "rgb(var(--color-muted-foreground))",
  "--diffs-font-family": "var(--font-family-mono)",
  "--diffs-header-font-family": "var(--font-family)",
  "--diffs-font-size": "11px",
  "--diffs-line-height": "20px",
  "--diffs-gap-block": "4px",
  "--diffs-gap-inline": "8px",
  "--diffs-scrollbar-gutter-override": "6px",
  scrollbarGutter: "stable",
} as CSSProperties;

const REVIEW_CODE_VIEW_UNSAFE_CSS = `
  :host {
    border: 0;
    background: var(--diffs-bg);
  }

  [data-diffs-header='default'] {
    min-height: 34px;
    padding-inline: 10px;
    border-block: 0 1px solid rgb(var(--color-border) / 0.32);
    background: var(--diffs-bg-context);
    font-size: 11px;
    font-weight: 600;
  }

  [data-header-content] {
    min-width: 0;
  }

  [data-header-content] [data-title],
  [data-header-content] [data-prev-name] {
    direction: ltr;
  }

  [data-diffs-header='default'] [data-metadata] {
    font-family: var(--diffs-font-family);
    font-size: 10px;
  }

  [data-code] {
    padding-block: 6px;
    scrollbar-color: rgb(var(--color-muted-foreground) / 0.34) transparent;
  }

  [data-code]::-webkit-scrollbar {
    width: 0;
    height: 6px;
  }

  [data-code]::-webkit-scrollbar-track,
  [data-code]::-webkit-scrollbar-corner {
    background: transparent;
  }

  [data-code]::-webkit-scrollbar-thumb {
    background-color: rgb(var(--color-muted-foreground) / 0.26);
    border: 1px solid transparent;
    background-clip: content-box;
    border-radius: 3px;
  }

  [data-code]:hover::-webkit-scrollbar-thumb {
    background-color: rgb(var(--color-muted-foreground) / 0.42);
  }

  [data-line],
  [data-column-number],
  [data-no-newline] {
    padding-inline: 0.85ch;
  }

  [data-column-number] {
    padding-left: 1.25ch;
  }

  [data-separator='line-info'] {
    margin-block: 3px;
  }

  [data-separator-content],
  [data-expand-button] {
    border-radius: 4px;
  }
`;

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
    <div className="min-w-0 px-3 py-2.5">
      <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t(label, fallbackLabel)}
      </div>
      <div
        className={`mt-1 font-mono text-[14px] font-semibold leading-none tabular-nums ${valueClass}`}
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
      className="flex flex-shrink-0 flex-wrap gap-1"
      role="radiogroup"
      aria-label={t("components.toolCallReview.filterLabel", "Review filter")}
    >
      {FILTER_OPTIONS.map((option) => {
        const active = activeFilter === option.id;
        const disabled = counts[option.id] === 0 && option.id !== "all";
        const Icon = option.icon;
        const label = t(option.labelKey, option.fallbackLabel);
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            role="radio"
            aria-checked={active}
            disabled={disabled}
            title={`${label} (${counts[option.id]})`}
            className={`group inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium motion-surface focus-ring ${
              active
                ? "border-border/70 bg-background text-foreground shadow-[0_1px_2px_rgba(var(--shadow-rgb),0.16)]"
                : disabled
                  ? "border-transparent text-muted-foreground/45"
                  : "border-transparent text-muted-foreground hover:bg-background/55 hover:text-foreground"
            }`}
          >
            <Icon
              className={`h-3.5 w-3.5 flex-shrink-0 ${active ? "text-[var(--accent)]" : "text-muted-foreground/70 group-hover:text-foreground"}`}
              aria-hidden="true"
            />
            <span className="truncate">{label}</span>
            <span
              className={`inline-flex h-4 min-w-[1.25rem] items-center justify-center rounded-full px-1 font-mono text-[10px] leading-none tabular-nums ${
                active
                  ? "bg-surface text-foreground"
                  : "bg-background/45 text-muted-foreground/85"
              }`}
            >
              {counts[option.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ReviewModeSwitch({
  activeMode,
  counts,
  onChange,
}: {
  activeMode: ReviewMode;
  counts: Record<ReviewMode, number>;
  onChange: (mode: ReviewMode) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="flex min-w-0 flex-1 gap-0.5 rounded-[6px] border border-border/40 bg-background/50 p-0.5"
      role="radiogroup"
      aria-label={t("components.toolCallReview.modeLabel", "Review mode")}
    >
      {REVIEW_MODE_OPTIONS.map((option) => {
        const active = activeMode === option.id;
        const Icon = option.icon;
        const label = t(option.labelKey, option.fallbackLabel);

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            role="radio"
            aria-checked={active}
            className={`flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2 text-[11px] font-medium motion-surface focus-ring ${
              active
                ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(var(--shadow-rgb),0.14)]"
                : "text-muted-foreground hover:bg-surface/55 hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
            <span className="font-mono text-[10px] tabular-nums opacity-75">
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
    <div className="flex items-baseline gap-2 border-b border-border/30 px-3 py-2">
      <span className="w-[3.5rem] flex-shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t(label, fallbackLabel)}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-5 text-foreground">
        {value}
      </span>
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
    <div className="min-w-0 border-b border-r border-border/30 px-3 py-2 last:border-r-0 [&:nth-child(2n)]:border-r-0">
      <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t(label, fallbackLabel)}
      </div>
      <div className={`mt-1 font-mono text-[14px] font-semibold tabular-nums ${className}`}>
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
    <div className="grid grid-cols-2 gap-2 border-y border-border/40 bg-[rgb(var(--color-surface-dark)/0.36)] px-2.5 py-2 sm:flex sm:items-stretch">
      <div className={`min-w-0 rounded-[5px] border px-3 py-2 sm:min-w-[140px] ${status.className}`}>
        <div className="text-[8px] uppercase tracking-[0.14em] opacity-75">
          {t("components.toolCallReview.statusLabel", "Status")}
        </div>
        <div className="mt-1 truncate text-xs font-semibold">
          {t(status.labelKey, status.fallbackLabel)}
        </div>
      </div>
      <div className="min-w-0 rounded-[5px] border border-border/40 bg-background/45 px-3 py-2 sm:min-w-[140px]">
        <div className="text-[8px] uppercase tracking-[0.14em] text-muted-foreground">
          {t("components.toolCallReview.impact", "Impact")}
        </div>
        <div className="mt-1 truncate font-mono text-xs font-semibold text-foreground">
          {impact}
        </div>
      </div>
    </div>
  );
}

interface CodeViewControls {
  splitView: boolean;
  wrap: boolean;
  expandUnchanged: boolean;
  setSplitView: (value: boolean) => void;
  setWrap: (value: boolean) => void;
  setExpandUnchanged: (value: boolean) => void;
}

function ViewControlsToolbar({ controls }: { controls: CodeViewControls }) {
  const { t } = useTranslation();

  const buttons: Array<{
    key: string;
    icon: typeof Columns2;
    active: boolean;
    onClick: () => void;
    labelKey: string;
    fallback: string;
  }> = [
    {
      key: "split",
      icon: controls.splitView ? Columns2 : Rows3,
      active: controls.splitView,
      onClick: () => controls.setSplitView(!controls.splitView),
      labelKey: controls.splitView
        ? "components.toolCallReview.controls.splitView"
        : "components.toolCallReview.controls.unifiedView",
      fallback: controls.splitView ? "Split view" : "Unified view",
    },
    {
      key: "wrap",
      icon: WrapText,
      active: controls.wrap,
      onClick: () => controls.setWrap(!controls.wrap),
      labelKey: "components.toolCallReview.controls.wrap",
      fallback: "Wrap long lines",
    },
    {
      key: "expand",
      icon: UnfoldVertical,
      active: controls.expandUnchanged,
      onClick: () => controls.setExpandUnchanged(!controls.expandUnchanged),
      labelKey: "components.toolCallReview.controls.expandUnchanged",
      fallback: "Expand context",
    },
  ];

  return (
    <div className="hidden flex-shrink-0 items-center gap-0.5 rounded-[6px] border border-border/40 bg-background/40 p-0.5 md:inline-flex">
      {buttons.map((button) => {
        const Icon = button.icon;
        const label = t(button.labelKey, button.fallback);
        return (
          <button
            key={button.key}
            type="button"
            onClick={button.onClick}
            aria-pressed={button.active}
            title={label}
            aria-label={label}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-[4px] motion-surface focus-ring ${
              button.active
                ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(var(--shadow-rgb),0.14)]"
                : "text-muted-foreground hover:bg-surface/55 hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function DetailPanel({
  operation,
  codeViewItems,
  selectedOperationId,
  onCopy,
  copied,
  contentExpanded,
  onToggleContentExpanded,
  controls,
}: {
  operation: FileOperation | null;
  codeViewItems: CodeViewItem[];
  selectedOperationId: string | null;
  onCopy: (operation: FileOperation) => void;
  copied: boolean;
  contentExpanded: boolean;
  onToggleContentExpanded: () => void;
  controls: CodeViewControls;
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
  const usesCodeView = isChangeOperation(operation) && hasCodeViewOutput;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const rootIsDark = document.documentElement.classList.contains("theme-dark");
  const themeType =
    theme === "dark" || rootIsDark || (theme === "system" && prefersDark)
      ? "dark"
      : "light";
  const contentFullscreenLabel = contentExpanded
    ? t(
        "components.toolCallReview.exitContentFullscreen",
        "Exit content fullscreen",
      )
    : t(
        "components.toolCallReview.contentFullscreen",
        "Fullscreen content",
      );
  const ContentFullscreenIcon = contentExpanded ? Minimize2 : Maximize2;

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-background"
      style={getReviewAccentStyle(operation.toolName)}
    >
      <div className="relative flex min-h-[50px] flex-shrink-0 items-center gap-2 border-b border-border/55 bg-[rgb(var(--color-surface-dark)/0.58)] px-3 py-1.5">
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
            <span className="rounded-[4px] border border-border/40 bg-background/45 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {t(config.labelKey, config.fallbackLabel)}
            </span>
            {operation.isError && (
              <span className="inline-flex items-center gap-1 rounded-[4px] border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-destructive">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {t("components.toolCallReview.error", "Error")}
              </span>
            )}
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {displayPath}
          </div>
        </div>
        {usesCodeView && <ViewControlsToolbar controls={controls} />}
        <button
          type="button"
          onClick={onToggleContentExpanded}
          aria-label={contentFullscreenLabel}
          title={contentFullscreenLabel}
          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[5px] border border-border/45 bg-background/60 text-muted-foreground motion-surface focus-ring hover:border-border-hover hover:bg-surface hover:text-foreground"
        >
          <ContentFullscreenIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onCopy(operation)}
          aria-label={t(
            "components.toolCallReview.copyOperation",
            "Copy operation details",
          )}
          className="inline-flex items-center gap-1.5 rounded-[5px] border border-border/45 bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground motion-surface focus-ring hover:border-border-hover hover:bg-surface hover:text-foreground"
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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={`custom-scrollbar min-h-0 min-w-0 flex-1 overscroll-contain ${
            usesCodeView ? "overflow-hidden" : "overflow-auto"
          }`}
          style={{ scrollbarGutter: "stable" }}
        >
          <div
            className={`min-h-0 bg-[rgb(var(--color-surface-dark)/0.24)] p-2.5 ${
              usesCodeView ? "flex h-full flex-col gap-2" : "space-y-2"
            }`}
          >
            {isChangeOperation(operation) && (
              <ReviewStatusStrip
                operation={operation}
                hasPatch={hasCodeViewOutput}
                hasPrimaryOutput={hasPrimaryOutput}
              />
            )}

            {usesCodeView ? (
              <div
                className="min-h-0 flex-1 overflow-hidden border border-border/45 bg-background shadow-[inset_0_1px_0_rgb(var(--highlight-rgb)/0.04)]"
                data-tool-review-code-view-frame="true"
              >
                <CodeView
                  ref={codeViewRef}
                  key={codeViewItems.map((item) => item.id).join(":")}
                  items={codeViewItems}
                  className="custom-scrollbar h-full min-h-0 overflow-auto bg-background"
                  style={REVIEW_CODE_VIEW_STYLE}
                  options={{
                    theme: { dark: "pierre-dark", light: "pierre-light" },
                    themeType,
                    diffStyle: controls.splitView ? "split" : "stacked",
                    overflow: controls.wrap ? "wrap" : "scroll",
                    stickyHeaders: true,
                    hunkSeparators: "line-info",
                    diffIndicators: "bars",
                    lineDiffType: "word",
                    expandUnchanged: controls.expandUnchanged,
                    lineHoverHighlight: true,
                    enableLineSelection: true,
                    enableGutterUtility: true,
                    itemMetrics: {
                      lineHeight: 20,
                      diffHeaderHeight: 36,
                    },
                    layout: {
                      paddingTop: 0,
                      paddingBottom: 12,
                      gap: 8,
                    },
                    unsafeCSS: REVIEW_CODE_VIEW_UNSAFE_CSS,
                  }}
                />
              </div>
            ) : operation.toolName === "bash" ? (
              <div className="space-y-3">
                <div className="tool-review-code-surface overflow-hidden border border-border/45 bg-background">
                  <div className="flex items-center gap-2 border-b border-border/35 bg-[rgb(var(--color-surface-dark)/0.52)] px-3 py-2 text-xs font-medium text-foreground">
                    <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("components.bashExecution.command", "Command")}
                  </div>
                  <CodeBlock
                    code={commandText}
                    language="bash"
                  />
                </div>
                {operation.output && (
                  <div className="tool-review-code-surface overflow-hidden border border-border/45 bg-background">
                    <div className="flex items-center gap-2 border-b border-border/35 bg-[rgb(var(--color-surface-dark)/0.52)] px-3 py-2 text-xs font-medium text-foreground">
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
                    />
                  </div>
                )}
              </div>
            ) : operation.diff ? (
              <div className="tool-review-code-surface overflow-hidden border border-border/45 bg-background">
                <CodeBlock
                  code={operation.diff}
                  language="diff"
                />
              </div>
            ) : operation.content ? (
              <div className="tool-review-code-surface overflow-hidden border border-border/45 bg-background">
                <CodeBlock
                  code={operation.content}
                  language={language}
                />
              </div>
            ) : operation.output ? (
              <div className="tool-review-code-surface overflow-hidden border border-border/45 bg-background">
                <CodeBlock
                  code={operation.output}
                  language={language || "text"}
                />
              </div>
            ) : (
              <div className="tool-review-code-surface overflow-hidden border border-border/45 bg-background">
                <div className="flex items-center gap-2 border-b border-border/35 bg-[rgb(var(--color-surface-dark)/0.45)] px-3 py-2">
                  <Braces
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1 text-xs font-medium text-foreground">
                    {t("components.toolCall.arguments", "Arguments")}
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground/80">
                    {t(
                      "components.toolCallReview.noRenderableOutput",
                      "No renderable output was captured for this operation.",
                    )}
                  </span>
                </div>
                <CodeBlock
                  code={argsText}
                  language="json"
                />
              </div>
            )}
          </div>
        </div>

        {!contentExpanded && (
          <aside className="hidden min-h-0 w-72 flex-shrink-0 flex-col border-l border-border/55 bg-[rgb(var(--color-surface-dark)/0.46)] xl:flex">
            <div className="flex min-h-[40px] items-center gap-2 border-b border-border/45 bg-[rgb(var(--color-surface-dark)/0.64)] px-3 py-2 text-[12px] font-semibold text-foreground">
              <Braces
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              {t("components.toolCallReview.inspector", "Inspector")}
            </div>
            <div className="grid grid-cols-2 border-b border-border/40 bg-background/35">
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
            <InspectorRow
              label="components.toolCallReview.entry"
              fallbackLabel="Entry"
              value={operation.entryId}
            />
            <InspectorRow
              label="components.toolCallReview.time"
              fallbackLabel="Time"
              value={formatTimestamp(operation.timestamp) || "-"}
            />
            <div className="min-h-0 flex-1 overflow-hidden border-t border-border/45 bg-background/45">
              <div className="border-b border-border/35 bg-[rgb(var(--color-surface-dark)/0.34)] px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("components.toolCall.arguments", "Arguments")}
              </div>
              <div
                className="tool-review-code-surface tool-review-inspector-code custom-scrollbar h-full min-h-0 overflow-auto p-2"
                style={{ scrollbarGutter: "stable" }}
              >
                <CodeBlock
                  code={argsText}
                  language="json"
                />
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function ToolCallReviewModal({
  isOpen,
  onClose,
  entries,
  toolResultByCallId,
  loading = false,
  error = null,
}: ToolCallReviewModalProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>(DEFAULT_REVIEW_FILTER);
  const [activeMode, setActiveMode] = useState<ReviewMode>("files");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [contentExpanded, setContentExpanded] = useState(false);
  const [splitView, setSplitView] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [expandUnchanged, setExpandUnchanged] = useState(false);

  const codeViewControls = useMemo<CodeViewControls>(
    () => ({
      splitView,
      wrap,
      expandUnchanged,
      setSplitView,
      setWrap,
      setExpandUnchanged,
    }),
    [splitView, wrap, expandUnchanged],
  );

  const allOperations = useMemo(
    () => extractFileOperations(entries, toolResultByCallId),
    [entries, toolResultByCallId],
  );
  const modeCounts = useMemo(() => {
    return REVIEW_MODE_OPTIONS.reduce(
      (acc, option) => {
        acc[option.id] = allOperations.filter(option.predicate).length;
        return acc;
      },
      { files: 0, shell: 0 } as Record<ReviewMode, number>,
    );
  }, [allOperations]);
  const resolvedMode =
    activeMode === "files" && modeCounts.files === 0 && modeCounts.shell > 0
      ? "shell"
      : activeMode;
  const modeOperations = useMemo(() => {
    const option = REVIEW_MODE_OPTIONS.find((item) => item.id === resolvedMode);
    return option ? allOperations.filter(option.predicate) : allOperations;
  }, [allOperations, resolvedMode]);
  const filterCounts = useMemo(() => {
    return FILTER_OPTIONS.reduce(
      (acc, option) => {
        acc[option.id] = modeOperations.filter(option.predicate).length;
        return acc;
      },
      {} as Record<ReviewFilter, number>,
    );
  }, [modeOperations]);

  const filteredOperations = useMemo(() => {
    const option = FILTER_OPTIONS.find((item) => item.id === activeFilter);
    return option ? modeOperations.filter(option.predicate) : modeOperations;
  }, [activeFilter, modeOperations]);

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
    if (filterCounts[activeFilter] === 0 && modeOperations.length > 0) {
      setActiveFilter("all");
    }
  }, [activeFilter, filterCounts, isOpen, modeOperations.length]);

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
        if (contentExpanded) {
          setContentExpanded(false);
          return;
        }
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
  }, [contentExpanded, filteredOperations, isOpen, onClose, selectedId]);

  useEffect(() => {
    if (!isOpen) setContentExpanded(false);
  }, [isOpen]);

  const handleToggleContentExpanded = useCallback(() => {
    setContentExpanded((value) => !value);
  }, []);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/45 p-2 backdrop-blur-md ui-enter-fade sm:p-3"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex h-[calc(100dvh_-_16px)] w-[calc(100vw_-_16px)] flex-col overflow-hidden rounded-[10px] border border-border/70 bg-background text-foreground shadow-[0_24px_80px_-36px_rgba(var(--shadow-rgb),0.72),0_0_0_1px_rgba(var(--highlight-rgb),0.04)] ui-enter-fade ui-enter-zoom sm:h-[min(1120px,calc(100dvh_-_24px))] sm:w-[min(1960px,calc(100vw_-_24px))]"
        role="dialog"
        data-tool-call-review-modal="true"
        aria-modal="true"
        aria-labelledby="tool-call-review-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="relative flex min-h-[44px] flex-shrink-0 items-center gap-2 border-b border-border/55 bg-[rgb(var(--color-surface-dark)/0.66)] px-4 py-2">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Wrench
              className="h-4 w-4 flex-shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <h2
              id="tool-call-review-title"
              className="truncate text-[14px] font-semibold text-foreground"
            >
              {t("components.toolCallReview.title", "Tool Call Review")}
            </h2>
            {allOperations.length > 0 && (
              <span className="ml-1 inline-flex h-5 items-center rounded-full bg-background/55 px-2 font-mono text-[10px] font-medium tabular-nums text-muted-foreground">
                {t("components.toolCallReview.operationCount", "{{count}} operations", {
                  count: allOperations.length,
                })}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="relative rounded-[5px] p-1.5 text-muted-foreground motion-surface focus-ring hover:bg-surface hover:text-foreground"
            aria-label={t("common.close", "Close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center bg-background">
            <div className="text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center border border-border/60 bg-surface/60">
                <Loader2
                  className="h-6 w-6 animate-spin text-muted-foreground/70"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-3 text-sm font-medium text-foreground">
                {t(
                  "components.toolCallReview.loading",
                  "Loading reviewable operations",
                )}
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center bg-background px-6">
            <div className="max-w-md text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center border border-destructive/45 bg-destructive/10">
                <AlertTriangle
                  className="h-6 w-6 text-destructive"
                  aria-hidden="true"
                />
              </div>
              <div className="mt-3 text-sm font-medium text-foreground">
                {t(
                  "components.toolCallReview.loadError",
                  "Failed to load reviewable operations",
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {error}
              </div>
            </div>
          </div>
        ) : allOperations.length === 0 ? (
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
          <div
            className={`flex min-h-0 flex-1 flex-col overflow-hidden ${contentExpanded ? "" : "md:flex-row"}`}
            data-tool-review-content-expanded={contentExpanded ? "true" : "false"}
          >
            {!contentExpanded && (
              <aside className="flex h-[min(300px,38dvh)] min-h-0 flex-shrink-0 flex-col border-b border-border/55 bg-[rgb(var(--color-surface-dark)/0.42)] ui-enter-fade md:h-auto md:w-[360px] md:border-b-0 md:border-r xl:w-[400px]">
                <div className="flex flex-col gap-2 border-b border-border/45 bg-[rgb(var(--color-surface-dark)/0.55)] p-2">
                  <ReviewModeSwitch
                    activeMode={resolvedMode}
                    counts={modeCounts}
                    onChange={setActiveMode}
                  />
                  <FilterBar
                    activeFilter={activeFilter}
                    counts={filterCounts}
                    onChange={setActiveFilter}
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-hidden bg-[rgb(var(--color-surface-dark)/0.34)]">
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
                <div className="grid grid-cols-4 divide-x divide-border/35 border-t border-border/45 bg-[rgb(var(--color-surface-dark)/0.62)]">
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
            )}

            <DetailPanel
              operation={selectedOperation}
              codeViewItems={selectedCodeViewItems}
              selectedOperationId={selectedOperation?.id ?? null}
              onCopy={handleCopy}
              copied={
                selectedOperation ? copiedId === selectedOperation.id : false
              }
              contentExpanded={contentExpanded}
              onToggleContentExpanded={handleToggleContentExpanded}
              controls={codeViewControls}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
