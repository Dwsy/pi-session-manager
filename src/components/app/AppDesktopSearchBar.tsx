import { useTranslation } from "react-i18next";
import { CheckSquare2 } from "lucide-react";

import SearchFilterBar from "@/components/search/SearchFilterBar";
import SessionSortSelect from "@/components/session-viewer/SessionSortSelect";
import type { SessionTag, Tag, DateRange } from "@/types";
import type { SessionSortBy, SessionSortOrder } from "@/types/sessionSort";

export type AppDesktopSearchBarViewMode = "list" | "project" | "kanban";

export interface AppDesktopSearchBarProps {
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
  sidebarMode: AppDesktopSearchBarViewMode;
  selectedProject: string | null;
  sortBy: SessionSortBy;
  sortOrder: SessionSortOrder;
  onSortByChange: (sortBy: SessionSortBy) => void;
  onSortOrderChange: (sortOrder: SessionSortOrder) => void;
  onSelectModeTrigger?: () => void;
}

function AppDesktopSearchBar({
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
  sidebarMode,
  selectedProject,
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
  onSelectModeTrigger,
}: AppDesktopSearchBarProps) {
  const { t } = useTranslation();
  const showSortSelect = sidebarMode === "list" || (sidebarMode === "project" && !!selectedProject);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
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
        onCreateTag={onCreateTag}
        getDescendantIds={getDescendantIds}
        placeholder={
          sidebarMode === "project" && !selectedProject
            ? t("common.searchProjectsPlaceholder")
            : undefined
        }
        compact
        className="flex-1"
      />
      {showSortSelect && (
        <>
          <SessionSortSelect
            value={sortBy}
            order={sortOrder}
            onChange={onSortByChange}
            onOrderChange={onSortOrderChange}
            compact
            showValueLabel={false}
            className="shrink-0"
          />
          {onSelectModeTrigger && (
            <button
              type="button"
              onClick={onSelectModeTrigger}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-secondary/40 text-muted-foreground hover:text-foreground motion-color motion-press focus-ring"
              aria-label={t("session.list.selectMode", { defaultValue: "Select mode" })}
              title={t("session.list.selectMode", { defaultValue: "Select mode" })}
            >
              <CheckSquare2 className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default AppDesktopSearchBar;
