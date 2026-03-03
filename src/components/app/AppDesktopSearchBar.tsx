import { useTranslation } from "react-i18next";

import SearchFilterBar from "../SearchFilterBar";
import SessionSortSelect from "../SessionSortSelect";
import type { SessionTag, Tag } from "../../types";
import type { SessionSortBy } from "../../types/sessionSort";

export type AppDesktopSearchBarViewMode = "list" | "project" | "kanban";

export interface AppDesktopSearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  tags: Tag[];
  sessionTags: SessionTag[];
  filterTagIds: string[];
  onFilterChange: (tagIds: string[]) => void;
  onCreateTag: (name: string, color: string, parentId?: string) => void;
  getDescendantIds: (tagId: string) => string[];
  viewMode: AppDesktopSearchBarViewMode;
  selectedProject: string | null;
  sortBy: SessionSortBy;
  onSortByChange: (sortBy: SessionSortBy) => void;
}

function AppDesktopSearchBar({
  searchQuery,
  onSearchChange,
  tags,
  sessionTags,
  filterTagIds,
  onFilterChange,
  onCreateTag,
  getDescendantIds,
  viewMode,
  selectedProject,
  sortBy,
  onSortByChange,
}: AppDesktopSearchBarProps) {
  const { t } = useTranslation();
  const showSortSelect = viewMode === "list" || (viewMode === "project" && !!selectedProject);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        tags={tags}
        sessionTags={sessionTags}
        filterTagIds={filterTagIds}
        onFilterChange={onFilterChange}
        onCreateTag={onCreateTag}
        getDescendantIds={getDescendantIds}
        placeholder={
          viewMode === "project" && !selectedProject
            ? t("common.searchProjectsPlaceholder")
            : undefined
        }
        compact
        className="flex-1"
      />
      {showSortSelect && (
        <SessionSortSelect
          value={sortBy}
          onChange={onSortByChange}
          className="shrink-0"
        />
      )}
    </div>
  );
}

export default AppDesktopSearchBar;
