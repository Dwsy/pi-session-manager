import SearchFilterBar from "../SearchFilterBar";
import SessionSortSelect from "../SessionSortSelect";
import type { SessionTag, Tag } from "../../types";
import type { SessionSortBy } from "../../types/sessionSort";

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
  sortBy: SessionSortBy;
  onSortByChange: (sortBy: SessionSortBy) => void;
  showSort?: boolean;
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
  sortBy,
  onSortByChange,
  showSort = true,
}: AppMobileFilterBarProps) {
  return (
    <div className="px-3 py-1.5 border-b border-border/50 space-y-1.5">
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
      {showSort && (
        <div className="flex justify-end">
          <SessionSortSelect value={sortBy} onChange={onSortByChange} />
        </div>
      )}
    </div>
  );
}

export default AppMobileFilterBar;
