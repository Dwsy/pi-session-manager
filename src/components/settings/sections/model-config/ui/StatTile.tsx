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
    <div className="group relative flex items-center gap-3.5 rounded-xl border border-border/60 bg-card/40 px-4 py-3 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-border hover:bg-card/60 hover:shadow">
      {icon && (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-105">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 text-xl font-bold tracking-tight text-foreground">
          {value}
        </div>
      </div>
    </div>
  );
}
