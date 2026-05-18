import { useMemo } from "react";
import { X, Calendar, Bot, Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Tag as TagType, DateRange } from "@/types";

interface ActiveFilterChipsProps {
  filterTagIds: string[];
  tags: TagType[];
  selectedSourceSlugs: string[];
  sourceOptions: Array<{ slug: string; label: string }>;
  selectedModel: string;
  dateRange: DateRange | null;
  totalCount?: number;
  filteredCount?: number;
  onRemoveTag: (tagId: string) => void;
  onRemoveSource: (slug: string) => void;
  onRemoveModel: () => void;
  onRemoveDateRange: () => void;
  onClearAll: () => void;
}

const COLOR_CSS: Record<string, string> = {
  info: "#3b82f6",
  success: "#22c55e",
  warning: "#f97316",
  destructive: "#ef4444",
  purple: "#a855f7",
  pink: "#ec4899",
  indigo: "#6366f1",
  amber: "#f59e0b",
  emerald: "#10b981",
  cyan: "#06b6d4",
  slate: "#64748b",
};

function resolveColor(color: string): string {
  if (color.startsWith("#")) return color;
  return COLOR_CSS[color] || "#3b82f6";
}

function formatDateRangeLabel(range: DateRange): string {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (range.start.getTime() === startOfDay.getTime()) return "Today";

  const diffDays = Math.round(
    (now.getTime() - range.start.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays === 7) return "7d";
  if (diffDays === 30) return "30d";

  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(range.start)}–${fmt(range.end)}`;
}

interface ChipProps {
  icon?: React.ReactNode;
  label: string;
  color?: string;
  onRemove: () => void;
}

function Chip({ icon, label, color, onRemove }: ChipProps) {
  return (
    <button
      onClick={onRemove}
      className="chip-enter inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-tight transition-all duration-150 hover:brightness-110 active:scale-[0.97] focus-ring"
      style={
        color
          ? {
              backgroundColor: `${color}18`,
              color,
              border: `1px solid ${color}30`,
            }
          : {
              backgroundColor: "rgb(var(--color-secondary) / 0.8)",
              color: "rgb(var(--color-foreground) / 0.8)",
              border: "1px solid rgb(var(--color-border) / 0.2)",
            }
      }
      title={label}
    >
      {icon}
      <span className="max-w-[120px] truncate">{label}</span>
      <X className="h-2.5 w-2.5 shrink-0 opacity-50 hover:opacity-100 transition-opacity" />
    </button>
  );
}

export default function ActiveFilterChips({
  filterTagIds,
  tags,
  selectedSourceSlugs,
  sourceOptions,
  selectedModel,
  dateRange,
  totalCount,
  filteredCount,
  onRemoveTag,
  onRemoveSource,
  onRemoveModel,
  onRemoveDateRange,
  onClearAll,
}: ActiveFilterChipsProps) {
  const { t } = useTranslation();
  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const sourceMap = useMemo(
    () => new Map(sourceOptions.map((s) => [s.slug, s])),
    [sourceOptions],
  );

  const chipCount =
    filterTagIds.length +
    selectedSourceSlugs.length +
    (selectedModel ? 1 : 0) +
    (dateRange ? 1 : 0);

  if (chipCount === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 min-h-0">
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
        {filterTagIds.map((tagId) => {
          const tag = tagMap.get(tagId);
          if (!tag) return null;
          return (
            <Chip
              key={`tag-${tagId}`}
              icon={
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: resolveColor(tag.color) }}
                />
              }
              label={tag.name}
              color={resolveColor(tag.color)}
              onRemove={() => onRemoveTag(tagId)}
            />
          );
        })}

        {selectedSourceSlugs.map((slug) => {
          const source = sourceMap.get(slug);
          return (
            <Chip
              key={`source-${slug}`}
              icon={<Folder className="h-2.5 w-2.5 shrink-0" />}
              label={source?.label || slug}
              color="#06b6d4"
              onRemove={() => onRemoveSource(slug)}
            />
          );
        })}

        {selectedModel && (
          <Chip
            icon={<Bot className="h-2.5 w-2.5 shrink-0" />}
            label={selectedModel}
            color="#a855f7"
            onRemove={onRemoveModel}
          />
        )}

        {dateRange && (
          <Chip
            icon={<Calendar className="h-2.5 w-2.5 shrink-0" />}
            label={formatDateRangeLabel(dateRange)}
            color="#f59e0b"
            onRemove={onRemoveDateRange}
          />
        )}

        {chipCount > 1 && (
          <button
            onClick={onClearAll}
            className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors focus-ring"
          >
            <X className="h-2.5 w-2.5" />
            {t("common.clearAll", "Clear")}
          </button>
        )}
      </div>

      {/* Session count */}
      {typeof totalCount === "number" && totalCount > 0 && (
        <span className="text-[11px] text-muted-foreground/60 tabular-nums shrink-0">
          {filteredCount !== undefined && filteredCount !== totalCount
            ? `${filteredCount}/${totalCount}`
            : `${totalCount}`}
        </span>
      )}
    </div>
  );
}
