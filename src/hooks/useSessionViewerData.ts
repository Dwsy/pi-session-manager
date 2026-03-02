import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import { invoke, listen } from '../transport'
import type { SessionEntry, SessionsDiff } from '../types'
import { getCachedSettings } from '../utils/settingsApi'
import { parseSessionEntries } from '../utils/session'

const SESSION_CONTENT_CACHE = new Map<
  string,
  {
    entries: SessionEntry[]
    lineCount: number
  }
>()
const MAX_CACHE_SIZE = 5

function cacheSessionContent(
  path: string,
  entries: SessionEntry[],
  lineCount: number
): void {
  if (SESSION_CONTENT_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = SESSION_CONTENT_CACHE.keys().next().value
    if (firstKey) {
      SESSION_CONTENT_CACHE.delete(firstKey)
    }
  }
  SESSION_CONTENT_CACHE.set(path, { entries, lineCount })
}

function getDefaultActiveEntryId(entries: SessionEntry[]): string | null {
  const lastMessage = entries.filter((entry) => entry.type === 'message').pop()
  if (lastMessage) {
    return lastMessage.id
  }
  return entries.length > 0 ? entries[0].id : null
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

  const pendingScrollToBottomRef = useRef(false)
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lineCountRef = useRef(0)
  const loadErrorMessageRef = useRef(loadErrorMessage)

  lineCountRef.current = lineCount

  useEffect(() => {
    loadErrorMessageRef.current = loadErrorMessage
  }, [loadErrorMessage])

  const loadIncremental = useCallback(async () => {
    if (!sessionPath) return

    try {
      const [newLineCount, newContent] = await invoke<[number, string]>(
        'read_session_file_incremental',
        {
          path: sessionPath,
          fromLine: lineCountRef.current,
        }
      )

      if (!newContent.trim()) {
        return
      }

      const newEntries = parseSessionEntries(newContent)
      if (newEntries.length === 0) {
        return
      }

      setEntries((prev) => {
        const merged = [...prev, ...newEntries]
        cacheSessionContent(sessionPath, merged, newLineCount)
        return merged
      })
      setLineCount(newLineCount)

      const nextActiveEntryId = getDefaultActiveEntryId(newEntries)
      if (nextActiveEntryId) {
        setActiveEntryId(nextActiveEntryId)
      }

      if (isAtBottomRef.current) {
        pendingScrollToBottomRef.current = true
      } else {
        setHasNewMessages(true)
      }
    } catch (incrementalError) {
      console.error(
        '[useSessionViewerData] Failed to load incremental session:',
        incrementalError
      )
    }
  }, [isAtBottomRef, sessionPath])

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
    pendingScrollToBottomRef.current = false

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

        const cached = SESSION_CONTENT_CACHE.get(sessionPath)
        if (cached) {
          setEntries(cached.entries)
          setLineCount(cached.lineCount)
          setActiveEntryId(getDefaultActiveEntryId(cached.entries))

          const openPosition = getCachedSettings().session?.openPosition ?? 'top'
          pendingScrollToBottomRef.current =
            !initialEntryId && openPosition === 'bottom'
          return
        }

        loadingTimerRef.current = setTimeout(() => {
          if (!cancelled) {
            setShowLoading(true)
          }
        }, 300)

        const jsonlContent = await invoke<string>('read_session_file', {
          path: sessionPath,
        })

        const parsedEntries = parseSessionEntries(jsonlContent)
        const lines = jsonlContent
          .split('\n')
          .filter((line) => line.trim()).length

        cacheSessionContent(sessionPath, parsedEntries, lines)

        if (cancelled) {
          return
        }

        setEntries(parsedEntries)
        setLineCount(lines)
        setActiveEntryId(getDefaultActiveEntryId(parsedEntries))

        const openPosition = getCachedSettings().session?.openPosition ?? 'top'
        pendingScrollToBottomRef.current =
          !initialEntryId && openPosition === 'bottom'
      } catch (loadError) {
        if (!cancelled) {
          console.error('[useSessionViewerData] Failed to load session:', loadError)
          setError(
            loadError instanceof Error
              ? loadError.message
              : loadErrorMessageRef.current
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
    // 仅在切换到不同 session 时执行完整加载
    // 同一 session 的文件变更通过增量监听处理
  }, [sessionPath])

  useEffect(() => {
    if (initialEntryId) {
      setScrollTargetId(initialEntryId)
    }
  }, [initialEntryId])

  useEffect(() => {
    if (!sessionPath || loading) return

    let unlisten: (() => void) | null = null

    const setup = async () => {
      try {
        unlisten = await listen<SessionsDiff>('sessions-changed', (event) => {
          const diff = event.payload
          if (!diff?.updated?.length) return

          const hit = diff.updated.some((session) => session.path === sessionPath)
          if (hit) {
            void loadIncremental()
          }
        })
      } catch (listenerError) {
        console.error(
          '[useSessionViewerData] Failed to setup sessions-changed listener:',
          listenerError
        )
      }
    }

    void setup()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [loadIncremental, loading, sessionPath])

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
  }
}
