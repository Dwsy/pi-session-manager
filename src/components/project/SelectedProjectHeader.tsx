import { ArrowLeft, FolderOpen } from "lucide-react";

interface SelectedProjectHeaderProps {
  projectName: string;
  sessionCount: number;
  onBack: () => void;
  backLabel: string;
  nameClassName?: string;
  liveCount?: number;
}

function SelectedProjectHeader({
  projectName,
  sessionCount,
  onBack,
  backLabel,
  nameClassName = "text-sm",
  liveCount,
}: SelectedProjectHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-background/30 flex-shrink-0 sticky top-0 z-10">
      <button
        onClick={onBack}
        className="p-1 rounded motion-color motion-press focus-ring flex-shrink-0 hover:bg-accent"
        aria-label={backLabel}
        title={backLabel}
      >
        <ArrowLeft className="h-4 w-4 text-muted-foreground" />
      </button>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <FolderOpen className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
        <span className={`${nameClassName} font-medium truncate`}>
          {projectName}
        </span>
        <span className="text-[11px] text-muted-foreground flex-shrink-0">
          ({sessionCount})
        </span>
        {liveCount && liveCount > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-green-500/10 text-green-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-[10px] font-medium">{liveCount}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export default SelectedProjectHeader;
