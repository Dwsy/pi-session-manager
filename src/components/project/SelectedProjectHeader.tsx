import { ArrowLeft, FolderOpen, Star } from "lucide-react";

interface SelectedProjectHeaderProps {
  projectName: string;
  sessionCount: number;
  onBack: () => void;
  backLabel: string;
  nameClassName?: string;
  liveCount?: number;
  isFavorite?: boolean;
}

function SelectedProjectHeader({
  projectName,
  sessionCount,
  onBack,
  backLabel,
  nameClassName = "text-sm",
  isFavorite = false,
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
        <div
          className={`p-0.5 rounded flex-shrink-0 ${isFavorite ? "bg-yellow-400/20" : ""}`}
        >
          {isFavorite ? (
            <Star className="h-3.5 w-3.5 text-yellow-500 fill-current" />
          ) : (
            <FolderOpen className="h-3.5 w-3.5 text-blue-400" />
          )}
        </div>
        <span className={`${nameClassName} font-medium truncate`}>
          {projectName}
        </span>
        <span className="text-[11px] text-muted-foreground flex-shrink-0">
          ({sessionCount})
        </span>
      </div>
    </div>
  );
}

export default SelectedProjectHeader;
