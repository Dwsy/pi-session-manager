import { DelayedLoadingCenter } from "@/components/ui/DelayedLoading";

/** Session viewer message pane loading (shown after delayed loading threshold). */
export function SessionMessagesLoadingState() {
  return <DelayedLoadingCenter />;
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
