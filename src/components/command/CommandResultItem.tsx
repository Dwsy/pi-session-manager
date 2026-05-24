import type { SearchPluginResult, SearchPlugin } from "@/plugins/types";

interface CommandResultItemProps {
  result: SearchPluginResult;
  plugin: SearchPlugin;
  isSelected: boolean;
  onSelect: () => void;
}

function DefaultResultItem({ result }: { result: SearchPluginResult }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-medium text-foreground">
        {result.title}
      </div>
      {result.subtitle && (
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {result.subtitle}
        </div>
      )}
      {result.description && (
        <div className="mt-1.5 line-clamp-2 text-xs text-muted-foreground/80">
          {result.description}
        </div>
      )}
    </div>
  );
}

export default function CommandResultItem({
  result,
  plugin,
  isSelected,
  onSelect,
}: CommandResultItemProps) {
  const content = plugin.renderItem?.(result) ?? (
    <DefaultResultItem result={result} />
  );

  return (
    <div
      onClick={onSelect}
      tabIndex={0}
      role="option"
      aria-selected={isSelected}
      className={[
        "group relative rounded-2xl border motion-context",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-info/30 focus-visible:ring-offset-0",
        isSelected
          ? "border-info/20 bg-info/[0.03] shadow-sm"
          : "border-transparent bg-transparent hover:border-border/70 hover:bg-background/78",
      ].join(" ")}
    >
      <div className="px-4 py-3.5 flex items-start gap-3">
        {/* {result.icon && (
          <div
            className={[
              'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border',
              isSelected
                ? 'border-info/20 bg-info/5 text-foreground'
                : 'border-border/60 bg-background text-muted-foreground',
            ].join(' ')}
          >
            {result.icon}
          </div>
        )} */}
        <div className="min-w-0 flex-1">{content}</div>
      </div>
    </div>
  );
}
