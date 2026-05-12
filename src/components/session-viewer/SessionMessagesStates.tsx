import { Loader2 } from "lucide-react";

export function SessionMessagesLoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export interface SessionMessagesErrorStateProps {
  title: string;
  error: string;
}

export function SessionMessagesErrorState({
  title,
  error,
}: SessionMessagesErrorStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center text-red-400">
      <div className="text-center">
        <p className="mb-2">{title}</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    </div>
  );
}

export interface SessionMessagesEmptyStateProps {
  label: string;
}

export function SessionMessagesEmptyState({
  label,
}: SessionMessagesEmptyStateProps) {
  return <div className="empty-state">{label}</div>;
}
