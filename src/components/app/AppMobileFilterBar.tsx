import SearchFilterBar from "../SearchFilterBar";
import type { SessionTag, Tag } from "../../types";

export interface AppMobileFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  tags: Tag[];
  sessionTags: SessionTag[];
  filterTagIds: string[];
  onFilterChange: (tagIds: string[]) => void;
  onCreateTag: (name: string, color: string, parentId?: string) => void;
  getDescendantIds: (tagId: string) => string[];
  placeholder?: string;
}

function AppMobileFilterBar({
  searchQuery,
  onSearchChange,
  tags,
  sessionTags,
  filterTagIds,
  onFilterChange,
  onCreateTag,
  getDescendantIds,
  placeholder,
}: AppMobileFilterBarProps) {
  return (
    <div className="px-3 py-1.5 border-b border-border/50">
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        tags={tags}
        sessionTags={sessionTags}
        filterTagIds={filterTagIds}
        onFilterChange={onFilterChange}
        onCreateTag={onCreateTag}
        getDescendantIds={getDescendantIds}
        placeholder={placeholder}
        compact={true}
      />
    </div>
  );
}

export default AppMobileFilterBar;
