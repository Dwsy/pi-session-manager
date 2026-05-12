import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { SessionViewerSearchBarProps } from "@/components/session-viewer/SessionViewerSearchBar";
import { useSessionViewerInMessageSearch } from "@/hooks/useSessionViewerInMessageSearch";
import type { SessionEntry } from "@/types";

export interface UseSessionViewerSearchControllerOptions {
  renderableEntries: SessionEntry[];
  toolResultByCallId: Map<string, SessionEntry>;
  showThinking: boolean;
  sessionPath: string;
  setShowMobileMenu: Dispatch<SetStateAction<boolean>>;
  restoreSearchExpandedTools: () => void;
}

export function useSessionViewerSearchController({
  renderableEntries,
  toolResultByCallId,
  showThinking,
  sessionPath,
  setShowMobileMenu,
  restoreSearchExpandedTools,
}: UseSessionViewerSearchControllerOptions) {
  const [searchFocusKey, setSearchFocusKey] = useState(0);

  const {
    isSearchOpen,
    searchQuery,
    searchScope,
    totalMatches,
    currentMatchNumber,
    currentTarget,
    openSearch,
    closeSearch,
    setSearchQuery,
    setSearchScope,
    goToNextMatch,
    goToPreviousMatch,
  } = useSessionViewerInMessageSearch({
    renderableEntries,
    toolResultByCallId,
    showThinking,
    sessionPath,
  });

  const handleOpenSearch = useCallback(() => {
    setShowMobileMenu(false);
    openSearch();
    setSearchFocusKey((value) => value + 1);
  }, [openSearch, setShowMobileMenu]);

  const handleCloseSearch = useCallback(() => {
    restoreSearchExpandedTools();
    closeSearch();
  }, [closeSearch, restoreSearchExpandedTools]);

  const searchBarProps: SessionViewerSearchBarProps = {
    searchQuery,
    searchScope,
    totalMatches,
    currentMatchNumber,
    focusKey: searchFocusKey,
    onSearchChange: setSearchQuery,
    onSearchScopeChange: setSearchScope,
    onPrevious: goToPreviousMatch,
    onNext: goToNextMatch,
    onClose: handleCloseSearch,
  };

  return {
    isSearchOpen,
    searchQuery,
    currentTarget,
    goToNextMatch,
    goToPreviousMatch,
    handleOpenSearch,
    handleCloseSearch,
    searchBarProps,
  };
}
