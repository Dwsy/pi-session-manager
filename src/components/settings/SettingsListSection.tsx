import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import Toggle from "@/components/ui/Toggle";

export type SettingsListRow =
  | {
      id: string;
      title: ReactNode;
      description?: ReactNode;
      icon?: ReactNode;
      badge?: ReactNode;
      checked: boolean;
      onChange: (checked: boolean) => void;
      disabled?: boolean;
      searchKey?: string;
      kind: "toggle";
    }
  | {
      id: string;
      title: ReactNode;
      description?: ReactNode;
      icon?: ReactNode;
      badge?: ReactNode;
      value?: ReactNode;
      onClick?: () => void;
      searchKey?: string;
      kind?: "display";
    }
  | {
      id: string;
      searchKey?: string;
      render: ReactNode;
      kind: "custom";
    };

interface SettingsListSectionProps {
  rows: SettingsListRow[];
  className?: string;
}

function RowChrome({
  children,
  searchKey,
}: {
  children: ReactNode;
  searchKey?: string;
}) {
  return (
    <div
      className="min-w-0 px-4 py-3"
      {...(searchKey ? { "data-settings-search": searchKey } : {})}
    >
      {children}
    </div>
  );
}

export default function SettingsListSection({
  rows,
  className = "",
}: SettingsListSectionProps) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-border/60 bg-background/35 divide-y divide-border/50 ${className}`}
    >
      {rows.map((row) => {
        if (row.kind === "custom") {
          return (
            <RowChrome key={row.id} searchKey={row.searchKey}>
              {row.render}
            </RowChrome>
          );
        }

        const content = (
          <>
            {row.icon && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/70 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
                {row.icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <div className="truncate text-sm font-medium text-foreground">
                  {row.title}
                </div>
                {row.badge}
              </div>
              {row.description && (
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {row.description}
                </div>
              )}
            </div>
          </>
        );

        if (row.kind === "toggle") {
          return (
            <RowChrome key={row.id} searchKey={row.searchKey}>
              <div className="flex min-w-0 items-center justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {content}
                </div>
                <Toggle
                  checked={row.checked}
                  onChange={row.onChange}
                  disabled={row.disabled}
                  size="sm"
                />
              </div>
            </RowChrome>
          );
        }

        return (
          <button
            key={row.id}
            type="button"
            onClick={row.onClick}
            disabled={!row.onClick}
            className="w-full text-left enabled:hover:bg-surface/60 disabled:cursor-default motion-color focus-ring"
            {...(row.searchKey ? { "data-settings-search": row.searchKey } : {})}
          >
            <div className="flex min-w-0 items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {content}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {row.value}
                {row.onClick && <ChevronRight className="h-4 w-4 opacity-60" />}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
