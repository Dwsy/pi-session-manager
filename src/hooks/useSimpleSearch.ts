import { useState, useCallback, useMemo } from 'react'
import type { SessionInfo } from '../types'
import { filterSessionsBySearchQuery } from '../utils/sessionFilters'

export interface UseSimpleSearchReturn {
  searchQuery: string
  isSearching: boolean
  filteredSessions: SessionInfo[]
  handleSearch: (query: string) => void
  clearSearch: () => void
}

export function useSimpleSearch(sessions: SessionInfo[]): UseSimpleSearchReturn {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) {
      return sessions
    }

    return filterSessionsBySearchQuery(sessions, searchQuery, { includeId: true })
  }, [sessions, searchQuery])

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    setIsSearching(false)
  }, [])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setIsSearching(false)
  }, [])

  return {
    searchQuery,
    isSearching,
    filteredSessions,
    handleSearch,
    clearSearch
  }
}
