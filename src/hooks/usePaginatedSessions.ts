import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke, listen } from '@/transport'
import type { SessionInfo } from '@/types'
import {
  DEFAULT_SESSION_SORT_BY,
  DEFAULT_SESSION_SORT_ORDER,
} from '@/types/sessionSort'
import type { SessionSortBy, SessionSortOrder } from '@/types/sessionSort'
import { isDemoModeEnabled, listDemoSessionsPaginated } from '@/demo'

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
  sortOrder?: SessionSortOrder
}

interface UsePaginatedSessionsReturn {
  sessions: SessionInfo[]
  total: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  hasLoadedOnce: boolean
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

function isSameSessionInfo(left: SessionInfo, right: SessionInfo): boolean {
  return (
    left.id === right.id &&
    left.path === right.path &&
    left.cwd === right.cwd &&
    left.name === right.name &&
    left.isDraft === right.isDraft &&
    left.created === right.created &&
    left.modified === right.modified &&
    left.message_count === right.message_count &&
    left.first_message === right.first_message &&
    left.last_message === right.last_message &&
    left.last_message_role === right.last_message_role &&
    left.isFavorite === right.isFavorite
  )
}

function mergePaginatedSessions(
  prev: SessionInfo[],
  incoming: SessionInfo[],
  append: boolean,
): SessionInfo[] {
  // Reuse previous references whenever possible to avoid unnecessary list re-renders.
  if (append) {
    if (incoming.length === 0) {
      return prev
    }

    const next = [...prev]
    const indexByPath = new Map<string, number>()

    for (let i = 0; i < next.length; i += 1) {
      indexByPath.set(next[i].path, i)
    }

    let changed = false
    for (const session of incoming) {
      const existingIndex = indexByPath.get(session.path)
      if (existingIndex === undefined) {
        indexByPath.set(session.path, next.length)
        next.push(session)
        changed = true
        continue
      }

      const existing = next[existingIndex]
      if (!isSameSessionInfo(existing, session)) {
        next[existingIndex] = session
        changed = true
      }
    }

    return changed ? next : prev
  }

  if (prev.length === 0 && incoming.length === 0) {
    return prev
  }

  const prevByPath = new Map(prev.map((session) => [session.path, session]))
  let changed = prev.length !== incoming.length

  const next = incoming.map((session) => {
    const existing = prevByPath.get(session.path)
    if (existing && isSameSessionInfo(existing, session)) {
      return existing
    }
    changed = true
    return session
  })

  if (!changed) {
    for (let i = 0; i < next.length; i += 1) {
      if (next[i] !== prev[i]) {
        changed = true
        break
      }
    }
  }

  return changed ? next : prev
}

export function usePaginatedSessions({
  enabled = true,
  pageSize = DEFAULT_PAGE_SIZE,
  searchQuery = '',
  projectFilter = null,
  filterTagIds = [],
  sortBy = DEFAULT_SESSION_SORT_BY,
  sortOrder = DEFAULT_SESSION_SORT_ORDER,
}: UsePaginatedSessionsOptions): UsePaginatedSessionsReturn {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(enabled)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  const requestIdRef = useRef(0)
  const latestForegroundRequestIdRef = useRef(0)
  const sessionsRef = useRef<SessionInfo[]>([])
  const inFlightRequestKeysRef = useRef(new Set<string>())

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  const shouldUseBackend = enabled && !isDemoModeEnabled()

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
  const normalizedSortOrder = useMemo(() => sortOrder, [sortOrder])
  const normalizedSortKey = useMemo(
    () => `${normalizedSortBy}_${normalizedSortOrder}`,
    [normalizedSortBy, normalizedSortOrder],
  )

  const requestPage = useCallback(
    async (offset: number, options: RequestPageOptions) => {
      if (!enabled) {
        return
      }

      const { append, silent = false, limit = pageSize } = options
      const requestKey = [
        offset,
        limit,
        append ? 'append' : 'replace',
        normalizedSearchQuery || '__empty__',
        normalizedProjectFilter || '__all__',
        normalizedSortKey,
        normalizedTagIds.join(',') || '__no_tags__',
      ].join('|')

      if (inFlightRequestKeysRef.current.has(requestKey)) {
        return
      }

      inFlightRequestKeysRef.current.add(requestKey)
      const requestId = ++requestIdRef.current

      if (!silent) {
        latestForegroundRequestIdRef.current = requestId
        if (append) {
          setLoadingMore(true)
        } else {
          setLoading(true)
        }
      }

      try {
        const [response, live] = await Promise.all([
          shouldUseBackend
            ? invoke<ScanSessionsPaginatedResponse>(
              'scan_sessions_paginated',
              {
                offset,
                limit,
                searchQuery: normalizedSearchQuery || null,
                projectFilter: normalizedProjectFilter,
                filterTagIds: normalizedTagIds.length > 0 ? normalizedTagIds : null,
                sortBy: normalizedSortKey,
                sort_by: normalizedSortKey,
              },
            )
            : Promise.resolve(listDemoSessionsPaginated({
              offset,
              limit,
              searchQuery: normalizedSearchQuery || null,
              projectFilter: normalizedProjectFilter,
              filterTagIds: normalizedTagIds.length > 0 ? normalizedTagIds : null,
              sortBy: normalizedSortBy,
              sortOrder: normalizedSortOrder,
            })),
          (shouldUseBackend && offset === 0)
            ? invoke<any[]>('get_pi_live_sessions')
            : Promise.resolve([])
        ])

        if (requestId !== requestIdRef.current) {
          return
        }

        let finalSessions = response.sessions
        if (offset === 0 && live.length > 0) {
          const liveMap = new Map(live.map(l => [l.session_id, l]))
          const visitedLiveIds = new Set<string>()

          const mergedScanned = response.sessions.map(s => {
            const liveInfo = liveMap.get(s.id)
            if (liveInfo) {
              visitedLiveIds.add(s.id)
              return { ...s, isLive: true, pid: liveInfo.pid }
            }
            return s
          })

          const newLive = live
            .filter(l => !visitedLiveIds.has(l.session_id))
            .map(l => ({
              id: l.session_id,
              path: l.session_path || l.session_id,
              name: l.session_id,
              modified: l.last_seen,
              message_count: l.entry_count,
              last_message: "",
              last_message_role: "assistant",
              isLive: true,
              pid: l.pid,
              cwd: l.cwd || "",
              first_message: "",
            } as SessionInfo))

          finalSessions = [...newLive, ...mergedScanned]
          // Re-sort if we added new items to ensure temporal order
          if (newLive.length > 0) {
             finalSessions.sort((a, b) => b.modified.localeCompare(a.modified))
          }
        }

        setSessions((prev) =>
          mergePaginatedSessions(prev, finalSessions, append),
        )
        setTotal(response.total)
        setHasMore(response.has_more)
        setHasLoadedOnce(true)
      } catch (error) {
        if (requestId !== requestIdRef.current) {
          return
        }

        console.error('[usePaginatedSessions] Failed to load paginated sessions:', error)
        setHasLoadedOnce(true)
        if (!append && !silent) {
          setSessions((prev) => (prev.length === 0 ? prev : []))
          setTotal(0)
          setHasMore(false)
        }
      } finally {
        if (!silent && requestId === latestForegroundRequestIdRef.current) {
          setLoading(false)
          setLoadingMore(false)
        }
        inFlightRequestKeysRef.current.delete(requestKey)
      }
    },
    [
      normalizedProjectFilter,
      normalizedSearchQuery,
      normalizedSortKey,
      normalizedSortOrder,
      normalizedTagIds,
      pageSize,
      enabled,
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
    if (!enabled || loading || loadingMore || !hasMore) {
      return
    }

    await requestPage(sessionsRef.current.length, { append: true })
  }, [enabled, hasMore, loading, loadingMore, requestPage])

  useEffect(() => {
    if (!enabled) {
      setSessions([])
      setTotal(0)
      setHasMore(false)
      setHasLoadedOnce(false)
      setLoading(false)
      setLoadingMore(false)
      return
    }

    void requestPage(0, { append: false })

    // Auto-refresh on live events
    if (shouldUseBackend) {
      const u1 = listen('pi-agent:register', () => refresh({ silent: true }))
      const u2 = listen('pi-agent:disconnect', () => refresh({ silent: true }))
      return () => {
        u1.then(f => f())
        u2.then(f => f())
      }
    }
  }, [enabled, requestPage, shouldUseBackend, refresh])

  return {
    sessions,
    total,
    loading,
    loadingMore,
    hasMore,
    hasLoadedOnce,
    refresh,
    loadMore,
  }
}
