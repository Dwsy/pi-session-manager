import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import { invoke } from '../transport'
import { rpcDebug, rpcError, rpcWarn } from '../utils/rpcDebug'
import { replaceEntriesWithRPCMessages, type RPCMessage } from '../utils/rpcMessageParser'
import { isTauriReady, parseSessionEntries } from '../utils/session'

import type { SessionEntry, SessionInfo } from '../types'

interface UseSessionLoaderOptions {
  session: SessionInfo
  useRPCMode: boolean
  rpcConnected: boolean
  loading: boolean
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  setShowLoading: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  messagesContainerRef: RefObject<HTMLDivElement>
  setEntries: React.Dispatch<React.SetStateAction<SessionEntry[]>>
  setActiveEntryId: React.Dispatch<React.SetStateAction<string | null>>
  clearUnreadState: () => void
  markUnreadMessage: () => void
  pendingScrollToBottomRef: React.MutableRefObject<boolean>
  autoFollowRef: React.MutableRefObject<boolean>
  isAtBottomRef: React.MutableRefObject<boolean>
  lastUnreadIdRef: React.MutableRefObject<string | null>
  resetMeasurements: () => void
  loadErrorText: string
  logPrefix?: string
}

export function useSessionLoader({
  session,
  useRPCMode,
  rpcConnected,
  loading,
  setLoading,
  setShowLoading,
  setError,
  messagesContainerRef,
  setEntries,
  setActiveEntryId,
  clearUnreadState,
  markUnreadMessage,
  pendingScrollToBottomRef,
  autoFollowRef,
  isAtBottomRef,
  lastUnreadIdRef,
  resetMeasurements,
  loadErrorText,
  logPrefix = 'SessionViewer',
}: UseSessionLoaderOptions): void {
  const [lineCount, setLineCount] = useState(0)
  const isScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const loadingTimerRef = useRef<NodeJS.Timeout | null>(null)

  const loadIncremental = useCallback(async () => {
    try {
      const result = await invoke<[number, string]>('read_session_file_incremental', {
        path: session.path,
        fromLine: lineCount,
      })

      const [newLineCount, newContent] = result

      if (newContent.trim()) {
        const newEntries = parseSessionEntries(newContent)

        if (newEntries.length > 0) {
          setEntries(prev => [...prev, ...newEntries])
          setLineCount(newLineCount)

          const lastMessage = newEntries.filter(e => e.type === 'message').pop()
          if (lastMessage) {
            setActiveEntryId(lastMessage.id)
          }

          if ((autoFollowRef.current || isAtBottomRef.current) && messagesContainerRef.current) {
            pendingScrollToBottomRef.current = true
            clearUnreadState()
          } else if (lastMessage?.id && lastMessage.id !== lastUnreadIdRef.current) {
            lastUnreadIdRef.current = lastMessage.id
            markUnreadMessage()
          }
        }
      }
    } catch (err) {
      console.error('Failed to load incremental session:', err)
    }
  }, [
    session.path,
    lineCount,
    setEntries,
    setActiveEntryId,
    autoFollowRef,
    isAtBottomRef,
    messagesContainerRef,
    pendingScrollToBottomRef,
    clearUnreadState,
    markUnreadMessage,
    lastUnreadIdRef,
  ])

  useEffect(() => {
    if (!session.path || loading || session.isDraft) return

    if (useRPCMode && rpcConnected) {
      rpcDebug(logPrefix, 'rpc mode active, skip file polling')
      return
    }

    const container = messagesContainerRef.current
    if (!container) return

    let checkInterval: NodeJS.Timeout

    const handleScroll = () => {
      isScrollingRef.current = true
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false
      }, 150)
    }

    const checkFileChanges = async () => {
      if (isScrollingRef.current) return
      if (!isTauriReady()) return
      try {
        await loadIncremental()
      } catch (err) {
        console.error('Failed to check file changes:', err)
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    checkInterval = setInterval(checkFileChanges, 1000)

    return () => {
      clearInterval(checkInterval)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
      container.removeEventListener('scroll', handleScroll)
    }
  }, [session.path, session.isDraft, loading, useRPCMode, rpcConnected, loadIncremental, messagesContainerRef, logPrefix])

  useEffect(() => {
    if (!session.path) return
    rpcDebug(logPrefix, 'load session start', { sessionPath: session.path })
    let cancelled = false

    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current)
      loadingTimerRef.current = null
    }

    setLineCount(0)
    if (!(useRPCMode && rpcConnected)) {
      setEntries([])
    }
    setActiveEntryId(null)
    clearUnreadState()
    lastUnreadIdRef.current = null
    pendingScrollToBottomRef.current = false
    autoFollowRef.current = true
    isAtBottomRef.current = true

    const doLoad = async () => {
      rpcDebug(logPrefix, 'loadSession called', { sessionPath: session.path })
      try {
        setLoading(true)
        setShowLoading(false)
        setError(null)
        resetMeasurements()

        if (session.isDraft) {
          rpcDebug(logPrefix, 'draft session selected, skip file load')
          setEntries([])
          setLineCount(0)
          setActiveEntryId(null)
          pendingScrollToBottomRef.current = true
          return
        }

        loadingTimerRef.current = setTimeout(() => {
          if (!cancelled) {
            rpcDebug(logPrefix, 'show loading after delay')
            setShowLoading(true)
          }
        }, 300)

        rpcDebug(logPrefix, 'invoking read_session_file')
        const jsonlContent = await invoke<string>('read_session_file', { path: session.path })

        if (cancelled) {
          rpcDebug(logPrefix, 'load cancelled')
          return
        }

        rpcDebug(logPrefix, 'read_session_file returned', { contentLength: jsonlContent?.length || 0 })

        const lines = jsonlContent.split('\n').filter(line => line.trim()).length
        setLineCount(lines)

        let parsedEntries = parseSessionEntries(jsonlContent)
        rpcDebug(logPrefix, 'parsed session entries', { count: parsedEntries.length })

        if (useRPCMode && rpcConnected) {
          parsedEntries = parsedEntries.filter(entry => entry.type !== 'message')
          try {
            const cachedMessages = await invoke<RPCMessage[]>('get_rpc_cached_messages', {
              expectedSessionPath: session.path,
            })
            parsedEntries = replaceEntriesWithRPCMessages(parsedEntries, cachedMessages)
          } catch (err) {
            rpcWarn(logPrefix, 'failed to load rpc cached messages', err)
          }
        }

        setEntries(parsedEntries)

        const lastMessage = parsedEntries
          .filter(e => e.type === 'message' && (e.message?.role === 'user' || e.message?.role === 'assistant'))
          .pop()
        if (lastMessage) {
          setActiveEntryId(lastMessage.id)
        }

        pendingScrollToBottomRef.current = true
      } catch (err) {
        if (!cancelled) {
          rpcError(logPrefix, 'failed to load session', err)
          setError(err instanceof Error ? err.message : loadErrorText)
        }
      } finally {
        if (!cancelled) {
          rpcDebug(logPrefix, 'loadSession finished')
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
      rpcDebug(logPrefix, 'loadSession cleanup')
      cancelled = true
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current)
        loadingTimerRef.current = null
      }
    }
  }, [
    session.path,
    session.isDraft,
    useRPCMode,
    rpcConnected,
    setLoading,
    setShowLoading,
    setError,
    setEntries,
    setActiveEntryId,
    clearUnreadState,
    lastUnreadIdRef,
    pendingScrollToBottomRef,
    autoFollowRef,
    isAtBottomRef,
    resetMeasurements,
    loadErrorText,
    logPrefix,
  ])

  return undefined
}
