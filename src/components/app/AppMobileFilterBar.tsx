import SearchFilterBar from "../SearchFilterBar";
import SessionSortSelect from "../SessionSortSelect";
import { CheckSquare2 } from "lucide-react";
import type { SessionTag, Tag } from "../../types";
import type { SessionSortBy } from "../../types/sessionSort";
import { useTranslation } from "react-i18next";

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
  onSelectModeTrigger?: () => void;
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
  onSelectModeTrigger,
}: AppMobileFilterBarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
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
        className="min-w-0 flex-1"
      />
      {showSort && (
        <>
          <SessionSortSelect
            value={sortBy}
            onChange={onSortByChange}
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

export default AppMobileFilterBar;
