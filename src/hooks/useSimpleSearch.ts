import { useState, useCallback, useMemo } from 'react'
import type { SessionInfo } from '../types'

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

    const query = searchQuery.toLowerCase().trim()
    const tokens = query.split(/\s+/).filter(Boolean)

    return sessions.filter(session => {
      const searchableText = [
        session.name || '',
        session.first_message || '',
        session.last_message || '',
        session.cwd || '',
        session.id || ''
      ].join(' ').toLowerCase()

      return tokens.every(token => searchableText.includes(token))
    })
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
