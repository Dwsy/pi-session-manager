import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="relative flex items-center gap-3 rounded-md border border-border bg-card px-3 py-3">
      {icon && (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
          {value}
        </div>
      </div>
    </div>
  );
}
