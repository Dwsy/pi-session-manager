import { useTranslation } from "react-i18next";

import SearchFilterBar from "../SearchFilterBar";
import type { SessionTag, Tag } from "../../types";

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
}: AppDesktopSearchBarProps) {
  const { t } = useTranslation();

  return (
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
    />
  );
}

export default AppDesktopSearchBar;
