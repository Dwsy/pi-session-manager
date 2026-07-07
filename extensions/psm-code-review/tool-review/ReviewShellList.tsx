import { useEffect, useRef, useState } from "react";
import { Terminal, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
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

const SHELL_LIST_COLLAPSED_MAX_PX = 72;

function ShellListItem({ operation, isSelected, onClick }: ShellListItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const snippetWrapRef = useRef<HTMLDivElement>(null);
  const command = operation.filePath;
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    if (isSelected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [isSelected]);

  useEffect(() => {
    if (snippetWrapRef.current) {
      setIsOverflowing(snippetWrapRef.current.scrollHeight > SHELL_LIST_COLLAPSED_MAX_PX + 4);
    }
  }, [command, expanded]);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={`group relative mb-1.5 cursor-pointer rounded-md border p-2.5 transition-all ${
        isSelected
          ? "border-accent bg-background/90 shadow-sm"
          : "border-border/40 bg-surface/40 hover:border-border/70 hover:bg-surface/70"
      }`}
    >
      <div className="flex items-start gap-2">
        <Terminal className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div
            ref={snippetWrapRef}
            className={
              !expanded && isOverflowing ? "max-h-[72px] overflow-hidden" : ""
            }
          >
            <ShellCodeSnippet code={command} language="bash" compact />
          </div>
          {!expanded && isOverflowing && (
            <div className="pointer-events-none absolute inset-x-0 bottom-7 h-6 bg-gradient-to-t from-background/90 to-transparent" />
          )}
        </div>
        {operation.isError && (
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-destructive" />
        )}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border/30 pt-1.5 text-[10px] text-muted-foreground/80">
        <div>
          #{operation.sequence} · {new Date(operation.timestamp).toLocaleTimeString()}
        </div>
        {isOverflowing && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex items-center gap-0.5 font-medium text-accent hover:underline"
          >
            <span>{expanded ? "折叠" : "展开全文"}</span>
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ReviewShellList({
  operations,
  selectedId,
  onSelect,
  ariaLabel,
}: ReviewShellListProps) {
  return (
    <div
      className="h-full overflow-auto px-2 py-1.5 custom-scrollbar"
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
    </div>
  );
}
