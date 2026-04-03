import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'

import { invoke, listen } from '../transport'
import type { SessionChunk, SessionEntry, SessionsDiff } from '../types'
import { trimMarkdownCacheOnSessionSwitch } from '../utils/markdown'
import { getCachedSettings } from '../utils/settingsApi'
import { parseSessionEntriesWithLineCount } from '../utils/session'
import { isDemoModeEnabled, readDemoSessionChunk } from '../demo'

function extractSessionId(sessionPath: string): string {
  const base = sessionPath.replace(/\.jsonl$/, '')
  return base.substring(base.lastIndexOf('/') + 1)
}

function appendDeltaToMessageContent(
  existingContent: any[] | undefined,
  assistantMessageEvent: any,
): any[] {
  const content = Array.isArray(existingContent) ? [...existingContent] : []
  const contentIndex = typeof assistantMessageEvent?.contentIndex === 'number'
    ? assistantMessageEvent.contentIndex
    : 0
  const deltaType = assistantMessageEvent?.type

  const ensureBlock = (type: 'text' | 'thinking') => {
    while (content.length <= contentIndex) content.push({ type: 'text', text: '' })
    if (!content[contentIndex] || content[contentIndex].type !== type) {
      content[contentIndex] = type === 'thinking'
        ? { type: 'thinking', thinking: '' }
        : { type: 'text', text: '' }
    }
    return content[contentIndex]
  }

  if (deltaType === 'text_start') {
    const block = ensureBlock('text')
    block.text = assistantMessageEvent?.partial?.text || block.text || ''
  } else if (deltaType === 'text_delta') {
    const block = ensureBlock('text')
    block.text = `${block.text || ''}${assistantMessageEvent?.delta || ''}`
  } else if (deltaType === 'text_end') {
    const block = ensureBlock('text')
    block.text = assistantMessageEvent?.content || block.text || ''
  } else if (deltaType === 'thinking_start') {
    const block = ensureBlock('thinking')
    block.thinking = assistantMessageEvent?.partial?.thinking || block.thinking || ''
  } else if (deltaType === 'thinking_delta') {
    const block = ensureBlock('thinking')
    block.thinking = `${block.thinking || ''}${assistantMessageEvent?.delta || ''}`
  } else if (deltaType === 'thinking_end') {
    const block = ensureBlock('thinking')
    block.thinking = assistantMessageEvent?.content || block.thinking || ''
  }

  return content
}

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
  isLive?: boolean
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
  isLive,
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
  const isLiveRef = useRef(isLive ?? false)

  lineCountRef.current = lineCount

  // Sync isLive prop to ref so the effect always has the latest status
  useEffect(() => {
    isLiveRef.current = isLive ?? isLiveRef.current
  }, [isLive])

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

    let unlistenSessionsChanged: (() => void) | null = null
    let unlistenLiveEntry: (() => void) | null = null
    let unlistenLiveRegister: (() => void) | null = null

    const setup = async () => {
      const sessionId = extractSessionId(sessionPath)

      // Track live session registration — when live, skip file-watcher disk reads
      const listenReg = await listen<{ sessionId: string }>('pi-agent:register', ({ payload }) => {
        if (payload.sessionId === sessionId) isLiveRef.current = true
      })
      
      const listenDisc = await listen<{ sessionId: string }>('pi-agent:disconnect', ({ payload }) => {
        if (payload.sessionId === sessionId) isLiveRef.current = false
      })
      unlistenLiveRegister = () => {
        listenReg();
        listenDisc();
      }

      // Only listen to file-watcher when NOT live (avoid conflict with real-time WS streaming)
      unlistenSessionsChanged = await listen<SessionsDiff>('sessions-changed', (event) => {
        if (isLiveRef.current) return
        const diff = event.payload
        if (!diff?.updated?.length) return

        const hit = diff.updated.some((session) => session.path === sessionPath)
        if (hit) {
          void loadMoreHistory({ asRealtime: true })
        }
      })

      // Pi Agent live streaming — receives entries via WebSocket
      unlistenLiveEntry = await listen<{ sessionId: string; eventType: string; entry: any }>(
        'pi-agent:entry',
        ({ payload }) => {
          if (payload.sessionId !== sessionId) return
          
          console.log(`[useSessionViewerData] Live event: ${payload.eventType}`, payload.entry);

          const raw = payload.entry as Record<string, any>
          if (raw._sessionPath && raw._sessionPath !== sessionPath) return

          const eventType = payload.eventType

          if (eventType.startsWith('message_')) {
            // Support both wrapped { message: ... } and flat message structures
            const rawMessage = raw.message || raw
            let messageId = rawMessage?.id

            // Fallback: if messageId is missing (e.g. in some message_update events),
            // find the last assistant message in the current entries and use its ID.
            if (!messageId) {
              setEntries((prev) => {
                const lastAssistant = prev.filter(
                  (e: SessionEntry) => e.type === 'message' && e.message?.role === 'assistant'
                ).pop()
                if (lastAssistant) messageId = lastAssistant.id
                return prev
              })
            }

            if (!messageId) return

            const nextContent = raw.assistantMessageEvent
              ? appendDeltaToMessageContent(rawMessage?.content, raw.assistantMessageEvent)
              : (Array.isArray(rawMessage?.content) ? rawMessage.content : [])

            const liveEntry: SessionEntry = {
              type: 'message',
              id: messageId,
              parentId: raw.parentId,
              timestamp: raw.timestamp || new Date().toISOString(),
              message: {
                ...rawMessage,
                role: rawMessage?.role || 'assistant',
                content: nextContent,
              },
            }

            setEntries((prev) => {
              const existingIndex = prev.findIndex((e) => e.id === messageId)
              if (existingIndex === -1) {
                return [...prev, liveEntry]
              }

              const next = [...prev]
              const existing = next[existingIndex]
              next[existingIndex] = {
                ...existing,
                ...liveEntry,
                message: {
                  ...existing.message,
                  ...liveEntry.message,
                  role: liveEntry.message?.role || existing.message?.role || 'assistant',
                  content: raw.assistantMessageEvent
                    ? appendDeltaToMessageContent(existing.message?.content as any[], raw.assistantMessageEvent)
                    : (liveEntry.message?.content || []),
                },
              }
              return next
            })

            setActiveEntryId(messageId)
            if (isAtBottomRef.current) {
              pendingScrollToBottomRef.current = true
            } else {
              setHasNewMessages(true)
            }
            return
          }

          if (eventType.startsWith('tool_execution_')) {
            const toolCallId = raw.toolCallId
            if (!toolCallId) return

            if (eventType === 'tool_execution_end') {
              const resultText = raw.result?.content?.find?.((c: any) => c.type === 'text')?.text || ''
              const toolResultEntry: SessionEntry = {
                type: 'message',
                id: `tool-result-${toolCallId}`,
                timestamp: raw.timestamp || new Date().toISOString(),
                message: {
                  role: 'toolResult',
                  toolCallId,
                  isError: !!raw.isError,
                  content: raw.result?.content || [{ type: 'text', text: resultText }],
                },
              }

              setEntries((prev) => {
                const existingIndex = prev.findIndex((e) => e.id === toolResultEntry.id)
                if (existingIndex === -1) return [...prev, toolResultEntry]
                const next = [...prev]
                next[existingIndex] = toolResultEntry
                return next
              })
            }
          }
        },
      )
    }

    void setup()

    return () => {
      isLiveRef.current = false
      unlistenSessionsChanged?.()
      unlistenLiveEntry?.()
      unlistenLiveRegister?.()
    }
  }, [loadMoreHistory, loading, sessionPath, isAtBottomRef])

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
