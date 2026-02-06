import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Content, SessionEntry } from '../types'
import { applyRPCEventToEntries, createRPCStreamingState, replaceEntriesWithRPCMessages, type RPCMessage } from '../utils/rpcMessageParser'
import { rpcDebug, summarizePayload } from '../utils/rpcDebug'
import { sessionPathMatches } from '../utils/sessionPath'
import type { RPCEvent } from './usePiRPC'

interface UseMessageStreamOptions {
  enabled: boolean
  rpcConnected: boolean
  rpcSessionReady: boolean
  isStreaming: boolean
  streamingText: string
  streamingThinking: string
  sessionPath: string
  sessionIsDraft: boolean
  rpcActiveSessionFile: string | null
  drainEvents: () => RPCEvent[]
  eventTick: number
  invokeGetMessages: (expectedSessionPath: string) => Promise<RPCMessage[]>
  logPrefix?: string
}

interface UseMessageStreamResult {
  entries: SessionEntry[]
  setEntries: React.Dispatch<React.SetStateAction<SessionEntry[]>>
  snapshotLoading: boolean
  snapshotError: string | null
  refreshSnapshot: () => void
  streamingEntryId: string | null
}

export function useMessageStream({
  enabled,
  rpcConnected,
  rpcSessionReady,
  isStreaming,
  streamingText,
  streamingThinking,
  sessionPath,
  sessionIsDraft,
  rpcActiveSessionFile,
  drainEvents,
  eventTick,
  invokeGetMessages,
  logPrefix = 'MessageStream',
}: UseMessageStreamOptions): UseMessageStreamResult {
  const [entries, setEntries] = useState<SessionEntry[]>([])
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [streamingEntryId, setStreamingEntryId] = useState<string | null>(null)
  const streamingStateRef = useRef(createRPCStreamingState())
  const snapshotDigestRef = useRef('')
  const snapshotInFlightRef = useRef(false)
  const pendingEventFlushRef = useRef(false)
  const snapshotTimerRef = useRef<NodeJS.Timeout | null>(null)
  const snapshotAlignedRef = useRef(false)
  const streamingFallbackIdRef = useRef<string | null>(null)

  const snapshotEnabled = enabled && rpcConnected && rpcSessionReady && !sessionIsDraft
  const streamingEnabled = enabled && rpcConnected && !sessionIsDraft

  const refreshSnapshot = useCallback(() => {
    if (!snapshotEnabled || snapshotInFlightRef.current) return
    snapshotInFlightRef.current = true
    setSnapshotLoading(true)
    setSnapshotError(null)
    const streamingActive = isStreaming || Boolean(streamingStateRef.current.currentAssistantId)
    if (streamingActive && snapshotAlignedRef.current) {
      snapshotInFlightRef.current = false
      setSnapshotLoading(false)
      return
    }
    if (rpcActiveSessionFile && !sessionPathMatches(sessionPath, rpcActiveSessionFile)) {
      snapshotInFlightRef.current = false
      setSnapshotLoading(false)
      return
    }
    invokeGetMessages(sessionPath)
      .then((messages) => {
        const digest = JSON.stringify(messages)
        if (digest !== snapshotDigestRef.current) {
          snapshotDigestRef.current = digest
          setEntries((prev) => replaceEntriesWithRPCMessages(prev, messages))
        }
        snapshotAlignedRef.current = true
      })
      .catch((err) => {
        setSnapshotError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        snapshotInFlightRef.current = false
        setSnapshotLoading(false)
      })
  }, [invokeGetMessages, isStreaming, rpcActiveSessionFile, sessionPath, snapshotEnabled])

  useEffect(() => {
    streamingStateRef.current = createRPCStreamingState()
    snapshotDigestRef.current = ''
    snapshotAlignedRef.current = false
    setStreamingEntryId(null)
    setSnapshotError(null)
    streamingFallbackIdRef.current = null
    drainEvents()
  }, [sessionPath, enabled])

  useEffect(() => {
    if (!enabled) {
      setStreamingEntryId(null)
    }
  }, [enabled])

  useEffect(() => {
    snapshotAlignedRef.current = false
  }, [snapshotEnabled])

  useEffect(() => {
    if (!snapshotEnabled) return
    if (snapshotTimerRef.current) {
      clearTimeout(snapshotTimerRef.current)
      snapshotTimerRef.current = null
    }
    const loop = () => {
      refreshSnapshot()
      const delay = isStreaming ? 360 : 1000
      snapshotTimerRef.current = setTimeout(loop, delay)
    }
    loop()
    return () => {
      if (snapshotTimerRef.current) {
        clearTimeout(snapshotTimerRef.current)
        snapshotTimerRef.current = null
      }
    }
  }, [snapshotEnabled, isStreaming, refreshSnapshot])

  useEffect(() => {
    if (!snapshotEnabled) return
    if (pendingEventFlushRef.current) return
    pendingEventFlushRef.current = true

    const raf = requestAnimationFrame(() => {
      pendingEventFlushRef.current = false
      const events = drainEvents()
      if (events.length === 0) return
      if (rpcActiveSessionFile && !sessionPathMatches(sessionPath, rpcActiveSessionFile)) {
        return
      }
      setEntries((prev) => {
        let next = prev
        for (const event of events) {
          const hasAssistantDelta = Boolean(event.assistant_message_event)
          const hasMessagePayload =
            Boolean(event.message) &&
            typeof event.message === 'object' &&
            typeof (event.message as { role?: unknown }).role === 'string'
          const isMessageUpdate =
            hasAssistantDelta ||
            hasMessagePayload ||
            event.type === 'message_update' ||
            event.type === 'assistant_message_event'
          if (!isMessageUpdate) continue

          rpcDebug(logPrefix, `apply event ${event.type}`, summarizePayload(event))
          const result = applyRPCEventToEntries(next, event, streamingStateRef.current)
          next = result.entries
        }
        return next
      })
      setStreamingEntryId(streamingStateRef.current.currentAssistantId)
    })

    return () => cancelAnimationFrame(raf)
  }, [snapshotEnabled, eventTick, drainEvents, rpcActiveSessionFile, sessionPath])

  useEffect(() => {
    if (!snapshotEnabled) return

    const nextText = streamingText
    const nextThinking = streamingThinking
    const hasStreamingContent = Boolean(nextText || nextThinking)

    if (!isStreaming && !hasStreamingContent) {
      if (streamingFallbackIdRef.current) {
        const fallbackId = streamingFallbackIdRef.current
        streamingFallbackIdRef.current = null
        setEntries(prev => prev.filter(entry => entry.id !== fallbackId))
      }
      return
    }

    if (!hasStreamingContent) return

    let entryId = streamingStateRef.current.currentAssistantId
    if (!entryId) {
      if (!streamingFallbackIdRef.current) {
        streamingFallbackIdRef.current = `rpc-stream-${Date.now()}`
      }
      entryId = streamingFallbackIdRef.current
    } else if (streamingFallbackIdRef.current && streamingFallbackIdRef.current !== entryId) {
      const staleId = streamingFallbackIdRef.current
      streamingFallbackIdRef.current = null
      setEntries(prev => prev.filter(entry => entry.id !== staleId))
    }

    if (!entryId) return

    setEntries(prev => {
      const index = prev.findIndex(
        entry => entry.id === entryId && entry.type === 'message' && entry.message?.role === 'assistant'
      )
      const existing = index >= 0 ? prev[index] : null
      const toolCalls =
        existing?.message?.content?.filter(content => content.type === 'toolCall') ?? []

      const content: Content[] = []
      if (nextThinking) {
        content.push({ type: 'thinking', thinking: nextThinking })
      }
      if (nextText) {
        content.push({ type: 'text', text: nextText })
      }
      if (toolCalls.length > 0) {
        content.push(...toolCalls)
      }

      const nextEntry: SessionEntry = {
        type: 'message',
        id: entryId,
        timestamp: existing?.timestamp || new Date().toISOString(),
        message: {
          role: 'assistant',
          content,
        },
      }

      if (index < 0) {
        return [...prev, nextEntry]
      }

      const updated = [...prev]
      updated[index] = nextEntry
      return updated
    })
    setStreamingEntryId(entryId)
  }, [streamingEnabled, isStreaming, streamingText, streamingThinking, setEntries])

  return useMemo(
    () => ({
      entries,
      setEntries,
      snapshotLoading,
      snapshotError,
      refreshSnapshot,
      streamingEntryId,
    }),
    [entries, snapshotLoading, snapshotError, refreshSnapshot, streamingEntryId]
  )
}
