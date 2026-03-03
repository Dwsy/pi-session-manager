import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '../transport'
import type { SessionInfo } from '../types'
import { DEFAULT_SESSION_SORT_BY } from '../types/sessionSort'
import type { SessionSortBy } from '../types/sessionSort'

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
  sortBy?: SessionSortBy
}

interface UsePaginatedSessionsReturn {
  sessions: SessionInfo[]
  total: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  refresh: (options?: RefreshOptions) => Promise<void>
  loadMore: () => Promise<void>
}

interface RefreshOptions {
  silent?: boolean
  preserveCount?: boolean
}

interface RequestPageOptions {
  append: boolean
  silent?: boolean
  limit?: number
}

export function usePaginatedSessions({
  enabled = true,
  pageSize = DEFAULT_PAGE_SIZE,
  searchQuery = '',
  projectFilter = null,
  filterTagIds = [],
  sortBy = DEFAULT_SESSION_SORT_BY,
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
  const normalizedSortBy = useMemo(() => sortBy, [sortBy])

  const requestPage = useCallback(
    async (offset: number, options: RequestPageOptions) => {
      if (!shouldUseBackend) {
        return
      }

      const { append, silent = false, limit = pageSize } = options
      const requestId = ++requestIdRef.current

      if (!silent) {
        if (append) {
          setLoadingMore(true)
        } else {
          setLoading(true)
        }
      }

      try {
        const response = await invoke<ScanSessionsPaginatedResponse>(
          'scan_sessions_paginated',
          {
            offset,
            limit,
            searchQuery: normalizedSearchQuery || null,
            projectFilter: normalizedProjectFilter,
            filterTagIds: normalizedTagIds.length > 0 ? normalizedTagIds : null,
            sortBy: normalizedSortBy,
            sort_by: normalizedSortBy,
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
        if (!append && !silent) {
          setSessions([])
          setTotal(0)
          setHasMore(false)
        }
      } finally {
        if (requestId !== requestIdRef.current) {
          return
        }

        if (!silent) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [
      normalizedProjectFilter,
      normalizedSearchQuery,
      normalizedSortBy,
      normalizedTagIds,
      pageSize,
      shouldUseBackend,
    ],
  )

  const refresh = useCallback(
    async (options: RefreshOptions = {}) => {
      const { silent = false, preserveCount = false } = options
      const currentCount = sessionsRef.current.length
      const requestedLimit = preserveCount
        ? Math.max(pageSize, currentCount)
        : pageSize
      const normalizedLimit = Math.min(Math.max(1, requestedLimit), 500)

      await requestPage(0, {
        append: false,
        silent,
        limit: normalizedLimit,
      })
    },
    [pageSize, requestPage],
  )

  const loadMore = useCallback(async () => {
    if (!shouldUseBackend || loading || loadingMore || !hasMore) {
      return
    }

    await requestPage(sessionsRef.current.length, { append: true })
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

    void requestPage(0, { append: false })
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
