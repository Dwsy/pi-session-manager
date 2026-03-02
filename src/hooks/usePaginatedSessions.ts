import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '../transport'
import type { SessionInfo } from '../types'

const DEFAULT_PAGE_SIZE = 100

interface ScanSessionsPaginatedResponse {
  sessions: SessionInfo[]
  total: number
  offset: number
  limit: number
  has_more: boolean
}

interface UsePaginatedSessionsOptions {
  enabled?: boolean
  pageSize?: number
  searchQuery?: string
  projectFilter?: string | null
  filterTagIds?: string[]
}

interface UsePaginatedSessionsReturn {
  sessions: SessionInfo[]
  total: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
}

export function usePaginatedSessions({
  enabled = true,
  pageSize = DEFAULT_PAGE_SIZE,
  searchQuery = '',
  projectFilter = null,
  filterTagIds = [],
}: UsePaginatedSessionsOptions): UsePaginatedSessionsReturn {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  const requestIdRef = useRef(0)
  const sessionsRef = useRef<SessionInfo[]>([])

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  const shouldUseBackend = enabled

  const normalizedSearchQuery = useMemo(() => searchQuery.trim(), [searchQuery])
  const normalizedProjectFilter = useMemo(
    () => projectFilter?.trim() || null,
    [projectFilter],
  )
  const normalizedTagIds = useMemo(
    () => Array.from(new Set(filterTagIds)).sort(),
    [filterTagIds],
  )

  const requestPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!shouldUseBackend) {
        return
      }

      const requestId = ++requestIdRef.current

      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }

      try {
        const response = await invoke<ScanSessionsPaginatedResponse>(
          'scan_sessions_paginated',
          {
            offset,
            limit: pageSize,
            searchQuery: normalizedSearchQuery || null,
            projectFilter: normalizedProjectFilter,
            filterTagIds: normalizedTagIds.length > 0 ? normalizedTagIds : null,
          },
        )

        if (requestId !== requestIdRef.current) {
          return
        }

        setSessions((prev) =>
          append ? [...prev, ...response.sessions] : response.sessions,
        )
        setTotal(response.total)
        setHasMore(response.has_more)
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return
        }

        console.error('[usePaginatedSessions] Failed to load paginated sessions:', error)
        if (!append) {
          setSessions([])
          setTotal(0)
          setHasMore(false)
        }
      } finally {
        if (requestId !== requestIdRef.current) {
          return
        }

        setLoading(false)
        setLoadingMore(false)
      }
    },
    [
      normalizedProjectFilter,
      normalizedSearchQuery,
      normalizedTagIds,
      pageSize,
      shouldUseBackend,
    ],
  )

  const refresh = useCallback(async () => {
    await requestPage(0, false)
  }, [requestPage])

  const loadMore = useCallback(async () => {
    if (!shouldUseBackend || loading || loadingMore || !hasMore) {
      return
    }

    await requestPage(sessionsRef.current.length, true)
  }, [hasMore, loading, loadingMore, requestPage, shouldUseBackend])

  useEffect(() => {
    if (!shouldUseBackend) {
      setSessions([])
      setTotal(0)
      setHasMore(false)
      setLoading(false)
      setLoadingMore(false)
      return
    }

    void requestPage(0, false)
  }, [requestPage, shouldUseBackend])

  return {
    sessions,
    total,
    loading,
    loadingMore,
    hasMore,
    refresh,
    loadMore,
  }
}
