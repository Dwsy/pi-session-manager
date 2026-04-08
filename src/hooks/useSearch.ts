import { useState, useCallback } from "react";
import type { SessionInfo, SearchResult } from "@/types";
import { searchRuntimeSessions } from "@/runtime-data/sessionSource";

export interface UseSearchReturn {
  searchResults: SearchResult[];
  isSearching: boolean;
  handleSearch: (query: string, sessions: SessionInfo[]) => Promise<void>;
  clearSearch: () => void;
}

export function useSearch(
  onSelectSession: (session: SessionInfo | null) => void,
): UseSearchReturn {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(
    async (query: string, sessions: SessionInfo[]) => {
      if (!query.trim()) {
        setSearchResults([]);
        return;
      }

      try {
        setIsSearching(true);
        const results = await searchRuntimeSessions(query, sessions);

        setSearchResults(results);
      } catch (error) {
        console.error("[useSearch] Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    },
    [onSelectSession],
  );

  const clearSearch = useCallback(() => {
    setSearchResults([]);
  }, []);

  return {
    searchResults,
    isSearching,
    handleSearch,
    clearSearch,
  };
}
