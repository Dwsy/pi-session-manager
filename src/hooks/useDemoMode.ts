import { useCallback } from 'react'

import type { FavoriteItem, SearchResult, SessionInfo } from '../types'
import {
  getDemoFavorites,
  getDemoSessionContent,
  getDemoSessions,
  getDemoStats,
  getDemoDayStats,
  isDemoModeEnabled,
  searchDemoSessions,
} from '../demo'

interface UseDemoModeReturn {
  isDemoMode: boolean
  getDemoSessions: () => SessionInfo[]
  getDemoFavorites: () => FavoriteItem[]
  getDemoSessionContent: (path: string) => string
  searchDemoSessions: (query: string, sessions: SessionInfo[]) => SearchResult[]
}

export { getDemoStats, getDemoDayStats }

export function useDemoMode(): UseDemoModeReturn {
  const getDemoSessionsCallback = useCallback((): SessionInfo[] => {
    return getDemoSessions()
  }, [])

  const getDemoFavoritesCallback = useCallback((): FavoriteItem[] => {
    return getDemoFavorites()
  }, [])

  const getDemoSessionContentCallback = useCallback((path: string): string => {
    return getDemoSessionContent(path)
  }, [])

  const searchDemoSessionsCallback = useCallback((query: string, sessions: SessionInfo[]): SearchResult[] => {
    return searchDemoSessions({ query, sessions })
  }, [])

  return {
    isDemoMode: isDemoModeEnabled(),
    getDemoSessions: getDemoSessionsCallback,
    getDemoFavorites: getDemoFavoritesCallback,
    getDemoSessionContent: getDemoSessionContentCallback,
    searchDemoSessions: searchDemoSessionsCallback,
  }
}
