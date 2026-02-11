import { useState, useCallback } from 'react'
import { invoke } from '../transport'
import { getCachedSettings } from '../utils/settingsApi'
import type { SessionInfo, SearchResult } from '../types'

export interface UseSearchReturn {
  searchResults: SearchResult[]
  isSearching: boolean
  handleSearch: (query: string, sessions: SessionInfo[]) => Promise<void>
  clearSearch: () => void
}

export function useSearch(
  onSelectSession: (session: SessionInfo | null) => void
): UseSearchReturn {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const handleSearch = useCallback(async (query: string, sessions: SessionInfo[]) => {
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    try {
      setIsSearching(true)
      const searchPrefs = getCachedSettings().search

      const results = await invoke<SearchResult[]>('search_sessions', {
        sessions,
        query,
        search_mode: searchPrefs.defaultSearchMode || 'content',
        role_filter: 'all',
        include_tools: searchPrefs.includeToolCalls ?? false,
      })

      setSearchResults(results)
    } catch (error) {
      console.error('[useSearch] Search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }, [onSelectSession])

  const clearSearch = useCallback(() => {
    setSearchResults([])
  }, [])

  return {
    searchResults,
    isSearching,
    handleSearch,
    clearSearch,
  }
}
