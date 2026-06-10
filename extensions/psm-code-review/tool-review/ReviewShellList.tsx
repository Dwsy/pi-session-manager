import { useEffect, useRef } from "react";
import { Terminal, AlertTriangle } from "lucide-react";
import type { FileOperation } from "./model";

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

function ShellListItem({ operation, isSelected, onClick }: ShellListItemProps) {
  const ref = useRef<HTMLDivElement>(null);
  const command = operation.filePath;
  const summary = command.length > 80 ? `${command.slice(0, 77)}...` : command;

  useEffect(() => {
    if (isSelected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [isSelected]);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={`cursor-pointer select-none border-l-2 px-3 py-2 transition-colors ${
        isSelected
          ? "border-l-accent bg-background/88"
          : "border-l-transparent hover:bg-background/52"
      }`}
    >
      <div className="flex items-center gap-2">
        <Terminal className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate font-mono text-xs text-foreground">
          {summary}
        </span>
        {operation.isError && (
          <AlertTriangle className="h-3 w-3 flex-shrink-0 text-destructive" />
        )}
      </div>
      <div className="mt-1 truncate text-[10px] text-muted-foreground/70">
        #{operation.sequence} · {new Date(operation.timestamp).toLocaleTimeString()}
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
      className="h-full overflow-auto py-1"
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
