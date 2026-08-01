import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { FileOperation } from "./model";
import ShellCodeSnippet from "./ShellCodeSnippet";

interface ReviewShellListProps {
  operations: FileOperation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  ariaLabel: string;
}

interface ShellListItemProps {
  operation: FileOperation;
  isSelected: boolean;
  onClick: () => void;
}

const SHELL_LIST_COLLAPSED_MAX_PX = 58;

function ShellListItem({ operation, isSelected, onClick }: ShellListItemProps) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLLIElement>(null);
  const snippetWrapRef = useRef<HTMLSpanElement>(null);
  const command = operation.filePath;
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    if (isSelected) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [isSelected]);

  useEffect(() => {
    const snippet = snippetWrapRef.current;
    if (!snippet) return;
    setIsOverflowing(snippet.scrollHeight > SHELL_LIST_COLLAPSED_MAX_PX + 4);
  }, [command, expanded]);

  const toggleLabel = expanded
    ? t("components.toolCallReview.collapseCommand", "Collapse command")
    : t("components.toolCallReview.expandCommand", "Expand command");

  return (
    <li
      ref={rowRef}
      role="listitem"
      className={`group relative border-b border-border/35 last:border-b-0 ${
        isSelected
          ? "theme-accent-bg-soft text-foreground before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-[var(--accent)]"
          : "text-foreground hover:bg-surface/45"
      }`}
      data-selected={isSelected ? "true" : "false"}
    >
      <button
        type="button"
        onClick={onClick}
        aria-current={isSelected ? "true" : undefined}
        className={`focus-ring block w-full px-2.5 py-2 text-left ${isOverflowing ? "pb-7" : ""}`}
      >
        <span className="mb-1 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
          <Terminal
            className={`h-3 w-3 shrink-0 ${isSelected ? "theme-accent-fg" : "text-[var(--tool-color-bash)]"}`}
            aria-hidden="true"
          />
          <span className="font-mono tabular-nums">#{operation.sequence}</span>
          <span aria-hidden="true">·</span>
          <time className="truncate" dateTime={operation.timestamp}>
            {new Date(operation.timestamp).toLocaleTimeString()}
          </time>
          {operation.isError && (
            <span className="ml-auto inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {t("components.toolCallReview.error", "Error")}
            </span>
          )}
        </span>
        <span
          ref={snippetWrapRef}
          className={`relative block min-w-0 ${
            !expanded && isOverflowing ? "max-h-[58px] overflow-hidden" : ""
          }`}
        >
          <ShellCodeSnippet code={command} language="bash" compact />
          {!expanded && isOverflowing && (
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-[rgb(var(--color-background)/0.92)] to-transparent" />
          )}
        </span>
      </button>

      {isOverflowing && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
          className="focus-ring absolute bottom-1.5 right-2 inline-flex h-5 items-center gap-0.5 rounded px-1.5 text-[10px] font-medium text-muted-foreground hover:bg-background/70 hover:text-foreground"
          aria-expanded={expanded}
          aria-label={toggleLabel}
          title={toggleLabel}
        >
          {expanded ? (
            <ChevronUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          )}
          <span>{toggleLabel}</span>
        </button>
      )}
    </li>
  );
}

export default function ReviewShellList({
  operations,
  selectedId,
  onSelect,
  ariaLabel,
}: ReviewShellListProps) {
  return (
    <ul
      className="custom-scrollbar h-full overflow-auto overscroll-contain"
      role="list"
      aria-label={ariaLabel}
    >
      {operations.map((operation) => (
        <ShellListItem
          key={operation.id}
          operation={operation}
          isSelected={selectedId === operation.id}
          onClick={() => onSelect(operation.id)}
        />
      ))}
    </ul>
  );
}
