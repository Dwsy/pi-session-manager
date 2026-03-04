import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import { invoke, listen } from '../transport'
import type { SessionChunk, SessionEntry, SessionsDiff } from '../types'
import { trimMarkdownCacheOnSessionSwitch } from '../utils/markdown'
import { getCachedSettings } from '../utils/settingsApi'
import { parseSessionEntriesWithLineCount } from '../utils/session'
import { isDemoModeEnabled, readDemoSessionChunk } from '../demo'

interface SessionCacheItem {
  entries: SessionEntry[]
  lineCount: number
  nextOffset: number
  fileSize: number
  hasMore: boolean
}

const SESSION_CONTENT_CACHE = new Map<string, SessionCacheItem>()
const MAX_CACHE_SIZE = 5

function cacheSessionContent(path: string, cacheItem: SessionCacheItem): void {
  if (SESSION_CONTENT_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = SESSION_CONTENT_CACHE.keys().next().value
    if (firstKey) {
      SESSION_CONTENT_CACHE.delete(firstKey)
    }
  }
  SESSION_CONTENT_CACHE.set(path, cacheItem)
}

function getDefaultActiveEntryId(entries: SessionEntry[]): string | null {
  const lastMessage = entries.filter((entry) => entry.type === 'message').pop()
  if (lastMessage) {
    return lastMessage.id
  }
  return entries.length > 0 ? entries[0].id : null
}

function normalizeEntryId(rawId: string): string {
  const duplicateMarker = '__dup_'
  const markerIndex = rawId.indexOf(duplicateMarker)
  if (markerIndex === -1) {
    return rawId
  }
  return rawId.slice(0, markerIndex)
}

function mergeEntriesWithUniqueIds(
  prevEntries: SessionEntry[],
  incomingEntries: SessionEntry[],
): SessionEntry[] {
  if (incomingEntries.length === 0) {
    return prevEntries
  }

  const idCounts = new Map<string, number>()

  for (const entry of prevEntries) {
    const baseId = normalizeEntryId(entry.id)
    idCounts.set(baseId, (idCounts.get(baseId) ?? 0) + 1)
  }

  const adjustedIncoming = incomingEntries.map((entry) => {
    const baseId = normalizeEntryId(entry.id)
    const count = idCounts.get(baseId) ?? 0
    idCounts.set(baseId, count + 1)

    if (count === 0) {
      return entry
    }

    return {
      ...entry,
      id: `${baseId}__dup_${count}`,
    }
  })

  return [...prevEntries, ...adjustedIncoming]
}

export interface UseSessionViewerDataOptions {
  sessionPath: string
  initialEntryId?: string
  loadErrorMessage: string
  isAtBottomRef: MutableRefObject<boolean>
}

export interface UseSessionViewerDataResult {
  entries: SessionEntry[]
  loading: boolean
  showLoading: boolean
  error: string | null
  activeEntryId: string | null
  setActiveEntryId: Dispatch<SetStateAction<string | null>>
  scrollTargetId: string | null
  setScrollTargetId: Dispatch<SetStateAction<string | null>>
  hasNewMessages: boolean
  setHasNewMessages: Dispatch<SetStateAction<boolean>>
  pendingScrollToBottomRef: MutableRefObject<boolean>
  hasMoreHistory: boolean
  loadMoreHistory: () => Promise<void>
}

export function useSessionViewerData({
  sessionPath,
  initialEntryId,
  loadErrorMessage,
  isAtBottomRef,
}: UseSessionViewerDataOptions): UseSessionViewerDataResult {
  const [entries, setEntries] = useState<SessionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showLoading, setShowLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lineCount, setLineCount] = useState(0)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)

  const pendingScrollToBottomRef = useRef(false)
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lineCountRef = useRef(0)
  const loadErrorMessageRef = useRef(loadErrorMessage)
  const nextOffsetRef = useRef(0)
  const fileSizeRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const hasMoreHistoryRef = useRef(false)

  lineCountRef.current = lineCount

  useEffect(() => {
    if (!sessionPath) {
      return
    }
    trimMarkdownCacheOnSessionSwitch()
  }, [sessionPath])

  useEffect(() => {
    loadErrorMessageRef.current = loadErrorMessage
  }, [loadErrorMessage])

  const updateHasMoreHistory = useCallback((next: boolean) => {
    hasMoreHistoryRef.current = next
    setHasMoreHistory(next)
  }, [])

  const loadMoreHistory = useCallback(
    async (options?: {
      asRealtime?: boolean
      maxBytes?: number
      force?: boolean
    }) => {
      const asRealtime = Boolean(options?.asRealtime)
      const force = Boolean(options?.force)
      const maxBytes = options?.maxBytes ?? 384 * 1024

      if (!sessionPath || loadingMoreRef.current) {
        return
      }

      if (!force && !asRealtime && !hasMoreHistoryRef.current) {
        return
      }

      try {
        loadingMoreRef.current = true

        const chunk = isDemoModeEnabled()
          ? readDemoSessionChunk(sessionPath, nextOffsetRef.current, maxBytes)
          : await invoke<SessionChunk>('read_session_file_chunk', {
            path: sessionPath,
            offset: nextOffsetRef.current,
            maxBytes,
          })

        nextOffsetRef.current = chunk.next_offset
        fileSizeRef.current = chunk.file_size
        updateHasMoreHistory(chunk.has_more)

        if (!chunk.content.trim()) {
          return
        }

        const { entries: newEntries, lineCount: addedLines } =
          parseSessionEntriesWithLineCount(chunk.content)

        if (newEntries.length === 0) {
          return
        }

        const nextLineCount = lineCountRef.current + addedLines
        lineCountRef.current = nextLineCount
        setLineCount(nextLineCount)

        setEntries((prev) => {
          const merged = mergeEntriesWithUniqueIds(prev, newEntries)
          cacheSessionContent(sessionPath, {
            entries: merged,
            lineCount: nextLineCount,
            nextOffset: chunk.next_offset,
            fileSize: chunk.file_size,
            hasMore: chunk.has_more,
          })
          return merged
        })

        if (asRealtime) {
          const nextActiveEntryId = getDefaultActiveEntryId(newEntries)
          if (nextActiveEntryId) {
            setActiveEntryId(nextActiveEntryId)
          }

          if (isAtBottomRef.current) {
            pendingScrollToBottomRef.current = true
          } else {
            setHasNewMessages(true)
          }
        }
      } catch (loadMoreError) {
        console.error('[useSessionViewerData] Failed to load session chunk:', loadMoreError)
      } finally {
        loadingMoreRef.current = false
      }
    },
    [isAtBottomRef, sessionPath],
  )

  useEffect(() => {
    let cancelled = false

    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current)
      loadingTimerRef.current = null
    }

    setLineCount(0)
    setEntries([])
    setActiveEntryId(null)
    setScrollTargetId(null)
    setHasNewMessages(false)
    updateHasMoreHistory(false)
    pendingScrollToBottomRef.current = false
    nextOffsetRef.current = 0
    fileSizeRef.current = 0
    loadingMoreRef.current = false

    if (!sessionPath) {
      setLoading(false)
      setShowLoading(false)
      setError(null)
      return () => {
        cancelled = true
      }
    }

    const doLoad = async () => {
      try {
        setLoading(true)
        setShowLoading(false)
        setError(null)

        const openPosition = getCachedSettings().session?.openPosition ?? 'top'

        const cached = SESSION_CONTENT_CACHE.get(sessionPath)
        if (cached) {
          if (openPosition === 'top' && cached.hasMore) {
            // Top mode expects full history available immediately for stable tree anchors.
            // Force a fresh full hydration to avoid partial-cache entry mismatch.
            SESSION_CONTENT_CACHE.delete(sessionPath)
          } else {
            setEntries(cached.entries)
            setLineCount(cached.lineCount)
            updateHasMoreHistory(cached.hasMore)
            nextOffsetRef.current = cached.nextOffset
            fileSizeRef.current = cached.fileSize
            lineCountRef.current = cached.lineCount
            setActiveEntryId(getDefaultActiveEntryId(cached.entries))

            pendingScrollToBottomRef.current =
              !initialEntryId && openPosition === 'bottom'
            return
          }
        }

        loadingTimerRef.current = setTimeout(() => {
          if (!cancelled) {
            setShowLoading(true)
          }
        }, 300)

        let chunk = isDemoModeEnabled()
          ? readDemoSessionChunk(sessionPath, 0, 384 * 1024)
          : await invoke<SessionChunk>('read_session_file_chunk', {
            path: sessionPath,
            offset: 0,
            maxBytes: 384 * 1024,
          })

        let { entries: allEntries, lineCount: totalLineCount } =
          parseSessionEntriesWithLineCount(chunk.content)
        let nextOffset = chunk.next_offset
        const fileSize = chunk.file_size
        let hasMore = chunk.has_more

        if (openPosition === 'top') {
          while (hasMore) {
            const nextChunk = isDemoModeEnabled()
              ? readDemoSessionChunk(sessionPath, nextOffset, 384 * 1024)
              : await invoke<SessionChunk>('read_session_file_chunk', {
                path: sessionPath,
                offset: nextOffset,
                maxBytes: 384 * 1024,
              })

            const { entries: chunkEntries, lineCount: chunkLineCount } =
              parseSessionEntriesWithLineCount(nextChunk.content)

            allEntries = mergeEntriesWithUniqueIds(allEntries, chunkEntries)
            totalLineCount += chunkLineCount
            nextOffset = nextChunk.next_offset
            hasMore = nextChunk.has_more
            chunk = nextChunk

            if (cancelled) {
              return
            }
          }
        }

        cacheSessionContent(sessionPath, {
          entries: allEntries,
          lineCount: totalLineCount,
          nextOffset,
          fileSize,
          hasMore,
        })

        if (cancelled) {
          return
        }

        nextOffsetRef.current = nextOffset
        fileSizeRef.current = fileSize
        lineCountRef.current = totalLineCount

        setEntries(allEntries)
        setLineCount(totalLineCount)
        updateHasMoreHistory(hasMore)
        setActiveEntryId(getDefaultActiveEntryId(allEntries))

        pendingScrollToBottomRef.current =
          !initialEntryId && openPosition === 'bottom'
      } catch (loadError) {
        if (!cancelled) {
          console.error('[useSessionViewerData] Failed to load session:', loadError)
          setError(
            loadError instanceof Error
              ? loadError.message
              : loadErrorMessageRef.current,
          )
        }
      } finally {
        if (!cancelled) {
          if (loadingTimerRef.current) {
            clearTimeout(loadingTimerRef.current)
            loadingTimerRef.current = null
          }
          setLoading(false)
          setShowLoading(false)
        }
      }
    }

    void doLoad()

    return () => {
      cancelled = true
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current)
        loadingTimerRef.current = null
      }
    }
  }, [initialEntryId, sessionPath, updateHasMoreHistory])

  useEffect(() => {
    if (initialEntryId) {
      setScrollTargetId(initialEntryId)
    }
  }, [initialEntryId])

  useEffect(() => {
    if (!sessionPath || loading) return
    if (isDemoModeEnabled()) return

    let unlisten: (() => void) | null = null

    const setup = async () => {
      try {
        unlisten = await listen<SessionsDiff>('sessions-changed', (event) => {
          const diff = event.payload
          if (!diff?.updated?.length) return

          const hit = diff.updated.some((session) => session.path === sessionPath)
          if (hit) {
            void loadMoreHistory({ asRealtime: true })
          }
        })
      } catch (listenerError) {
        console.error(
          '[useSessionViewerData] Failed to setup sessions-changed listener:',
          listenerError,
        )
      }
    }

    void setup()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [loadMoreHistory, loading, sessionPath])

  return {
    entries,
    loading,
    showLoading,
    error,
    activeEntryId,
    setActiveEntryId,
    scrollTargetId,
    setScrollTargetId,
    hasNewMessages,
    setHasNewMessages,
    pendingScrollToBottomRef,
    hasMoreHistory,
    loadMoreHistory: async () => {
      await loadMoreHistory()
    },
  }
}
