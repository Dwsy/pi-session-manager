import SearchFilterBar from "@/components/search/SearchFilterBar";
import ActiveFilterChips from "@/components/search/ActiveFilterChips";
import { CheckSquare2 } from "lucide-react";
import type { SessionTag, Tag, DateRange } from "@/types";
import type { SessionSortBy, SessionSortOrder } from "@/types/sessionSort";
import { useTranslation } from "react-i18next";

export interface AppMobileFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  tags: Tag[];
  sessionTags: SessionTag[];
  filterTagIds: string[];
  onFilterChange: (tagIds: string[]) => void;
  sourceOptions?: Array<{ slug: string; label: string }>;
  selectedSourceSlugs?: string[];
  onSourceFilterChange?: (slugs: string[]) => void;
  modelOptions?: string[];
  selectedModel?: string;
  onModelFilterChange?: (model: string) => void;
  dateRange?: DateRange | null;
  onDateRangeChange?: (range: DateRange | null) => void;
  onCreateTag: (name: string, color: string, parentId?: string) => void;
  getDescendantIds: (tagId: string) => string[];
  totalCount?: number;
  filteredCount?: number;
  placeholder?: string;
  sortBy: SessionSortBy;
  sortOrder: SessionSortOrder;
  onSortByChange: (sortBy: SessionSortBy) => void;
  onSortOrderChange: (sortOrder: SessionSortOrder) => void;
  showSort?: boolean;
  onSelectModeTrigger?: () => void;
}

function AppMobileFilterBar({
  searchQuery,
  onSearchChange,
  tags,
  sessionTags,
  filterTagIds,
  onFilterChange,
  sourceOptions,
  selectedSourceSlugs,
  onSourceFilterChange,
  modelOptions,
  selectedModel,
  onModelFilterChange,
  dateRange,
  onDateRangeChange,
  onCreateTag,
  getDescendantIds,
  totalCount,
  filteredCount,
  placeholder,
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
  onSelectModeTrigger,
}: AppMobileFilterBarProps) {
  const { t } = useTranslation();

  return (
    <div className="border-b border-border/50">
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <SearchFilterBar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          tags={tags}
          sessionTags={sessionTags}
          filterTagIds={filterTagIds}
          onFilterChange={onFilterChange}
          sourceOptions={sourceOptions}
          selectedSourceSlugs={selectedSourceSlugs}
          onSourceFilterChange={onSourceFilterChange}
          modelOptions={modelOptions}
          selectedModel={selectedModel}
          onModelFilterChange={onModelFilterChange}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSortByChange={onSortByChange}
          onSortOrderChange={onSortOrderChange}
          onCreateTag={onCreateTag}
          getDescendantIds={getDescendantIds}
          placeholder={placeholder}
          compact={true}
          className="min-w-0 flex-1"
        />
        {onSelectModeTrigger && (
          <button
            type="button"
            onClick={onSelectModeTrigger}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground motion-color focus-ring"
            aria-label={t("session.list.selectMode", { defaultValue: "Select mode" })}
            title={t("session.list.selectMode", { defaultValue: "Select mode" })}
          >
            <CheckSquare2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <ActiveFilterChips
        filterTagIds={filterTagIds}
        tags={tags}
        selectedSourceSlugs={selectedSourceSlugs || []}
        sourceOptions={sourceOptions || []}
        selectedModel={selectedModel || ""}
        dateRange={dateRange || null}
        totalCount={totalCount}
        filteredCount={filteredCount}
        onRemoveTag={(tagId) => onFilterChange(filterTagIds.filter((id) => id !== tagId))}
        onRemoveSource={(slug) => onSourceFilterChange?.(selectedSourceSlugs?.filter((s) => s !== slug) || [])}
        onRemoveModel={() => onModelFilterChange?.("")}
        onRemoveDateRange={() => onDateRangeChange?.(null)}
        onClearAll={() => {
          onFilterChange([]);
          onSourceFilterChange?.([]);
          onModelFilterChange?.("");
          onDateRangeChange?.(null);
        }}
      />
    </div>
  );
}

export default AppMobileFilterBar;
