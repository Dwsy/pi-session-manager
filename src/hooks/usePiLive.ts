/**
 * Pi Live Hook - Unified Pi Live session management
 *
 * Features:
 * 1. Fetch session list from backend
 * 2. Listen to WS events
 * 3. Manage connection state
 * 4. Provide CRUD methods
 * 5. Read settings to decide if enabled
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { invoke, listen } from '@/transport'
import { getCachedSettings } from '@/utils/settingsApi'
import type {
  PiLiveSession,
  PiLiveSessionRegisteredPayload,
  PiLiveSessionDisconnectedPayload,
  PiLiveStateUpdatedPayload,
  PiLiveQueueUpdatePayload,
  PiLiveSlashCommand,
  PiLiveChatEventPayload,
  PiLiveConnectionState,
  PiLiveSettings,
} from '@/types/pi-live'
import { extractSessionUuid } from '@/types/pi-live'

// Legacy type for backward compatibility
export type LiveSessionInfo = PiLiveSession

export interface UsePiLiveOptions {
  /** Manual control - no auto refresh */
  manual?: boolean
  /** Refresh interval (ms), 0 = no auto refresh */
  refreshInterval?: number
}

export interface UsePiLiveReturn {
  /** Session list */
  sessions: PiLiveSession[]
  /** UUID set for fast matching */
  liveSessionIds: Set<string>
  /** Connection state */
  connectionState: PiLiveConnectionState
  /** Whether enabled */
  isEnabled: boolean
  /** Whether to show in sidebar */
  showInSidebar: boolean
  /** Settings */
  settings: PiLiveSettings
  /** Refresh session list */
  refresh: () => Promise<void>
  /** Send prompt message */
  prompt: (sessionId: string, message: string, streamingBehavior?: string) => Promise<void>
  /** Send steering message */
  steer: (sessionId: string, message: string) => Promise<void>
  /** Send follow-up message */
  followUp: (sessionId: string, message: string) => Promise<void>
  /** Set model */
  setModel: (sessionId: string, provider: string, modelId: string) => Promise<void>
  /** Set thinking level */
  setThinkingLevel: (sessionId: string, level: string) => Promise<void>
  /** Available slash commands for current live session */
  getCommands: (sessionId: string) => Promise<PiLiveSlashCommand[]>
  /** Abort generation */
  abort: (sessionId: string) => Promise<void>
}

export function usePiLive(options: UsePiLiveOptions = {}): UsePiLiveReturn {
  const { manual = false, refreshInterval = 30000 } = options

  const [sessions, setSessions] = useState<PiLiveSession[]>([])
  const [connectionState, setConnectionState] = useState<PiLiveConnectionState>('disconnected')
  const refreshCountRef = useRef(0)

  // Read settings
  const settings = useMemo(() => {
    return getCachedSettings().piLive
  }, [])

  const isEnabled = settings.enabled
  const showInSidebar = settings.showInSidebar

  const matchesSessionId = useCallback((candidate: string, target: string) => {
    if (!candidate || !target) return false
    if (candidate === target) return true
    const candidateUuid = extractSessionUuid(candidate)
    const targetUuid = extractSessionUuid(target)
    return Boolean(
      (candidateUuid && candidateUuid === target)
      || (targetUuid && targetUuid === candidate)
      || (candidateUuid && targetUuid && candidateUuid === targetUuid)
      || candidate.includes(target)
      || target.includes(candidate),
    )
  }, [])

  const upsertSession = useCallback((session: PiLiveSession) => {
    setSessions((prev) => {
      const index = prev.findIndex((item) => matchesSessionId(item.sessionId, session.sessionId))
      if (index === -1) {
        return [session, ...prev]
      }
      const next = [...prev]
      next[index] = {
        ...next[index],
        ...session,
      }
      return next
    })
  }, [matchesSessionId])

  const patchSession = useCallback((sessionId: string, patch: Partial<PiLiveSession>) => {
    setSessions((prev) =>
      prev.map((item) =>
        matchesSessionId(item.sessionId, sessionId)
          ? { ...item, ...patch }
          : item,
      ),
    )
  }, [matchesSessionId])

  const removeSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((item) => !matchesSessionId(item.sessionId, sessionId)))
  }, [matchesSessionId])

  // Create UUID set for fast matching
  const liveSessionIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of sessions) {
      const uuidMatch = s.sessionId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      if (uuidMatch) ids.add(uuidMatch[0])
    }
    return ids
  }, [sessions])

  // Refresh session list
  const refresh = useCallback(async () => {
    if (!isEnabled) return
    try {
      const result = await invoke<PiLiveSession[]>('get_pi_live_sessions')
      setSessions(result)
      refreshCountRef.current++
    } catch {
      // Backend may not be ready
    }
  }, [isEnabled])

  // Command senders
  const prompt = useCallback(async (sessionId: string, message: string, streamingBehavior?: string) => {
    await invoke('pi_agent_prompt', { sessionId, message, streamingBehavior })
  }, [])

  const steer = useCallback(async (sessionId: string, message: string) => {
    await invoke('pi_agent_steer', { sessionId, message })
  }, [])

  const followUp = useCallback(async (sessionId: string, message: string) => {
    await invoke('pi_agent_follow_up', { sessionId, message })
  }, [])

  const setModel = useCallback(async (sessionId: string, provider: string, modelId: string) => {
    await invoke('pi_agent_set_model', { sessionId, provider, modelId })
  }, [])

  const setThinkingLevel = useCallback(async (sessionId: string, level: string) => {
    await invoke('pi_agent_set_thinking_level', { sessionId, level })
  }, [])

  const getCommands = useCallback(async (sessionId: string) => {
    const result = await invoke<{ commands?: PiLiveSlashCommand[] }>('pi_agent_get_commands', { sessionId })
    return result?.commands || []
  }, [])

  const abort = useCallback(async (sessionId: string) => {
    await invoke('pi_agent_abort', { sessionId })
  }, [])

  // Listen to events
  useEffect(() => {
    if (!isEnabled || manual) return

    const unsubs: (() => void)[] = []

    const setupListeners = async () => {
      listen<PiLiveSessionRegisteredPayload>('pi-live:session_registered', ({ payload }) => {
        setConnectionState('connected')
        upsertSession({
          sessionId: payload.sessionId,
          sessionPath: payload.sessionPath,
          pid: payload.pid,
          cwd: payload.cwd,
          isStreaming: false,
          entryCount: payload.entries?.length ?? 0,
          lastSeen: new Date().toISOString(),
        })
      }).then(f => unsubs.push(f))

      listen<PiLiveSessionDisconnectedPayload>('pi-live:session_disconnected', ({ payload }) => {
        removeSession(payload.sessionId)
        setConnectionState('disconnected')
      }).then(f => unsubs.push(f))

      listen<PiLiveStateUpdatedPayload>('pi-live:state_updated', ({ payload }) => {
        patchSession(payload.sessionId, {
          model: payload.model,
          thinkingLevel: payload.thinkingLevel,
          contextUsage: payload.contextUsage,
          isStreaming: payload.isStreaming,
          pendingMessageCount: payload.pendingMessageCount,
          sessionPath: payload.sessionPath,
          tags: payload.tags,
          lastSeen: new Date().toISOString(),
        })
      }).then(f => unsubs.push(f))

      listen<PiLiveQueueUpdatePayload>('queue_update', ({ payload }) => {
        patchSession(payload.sessionId, {
          steeringQueue: payload.steering,
          followUpQueue: payload.followUp,
          pendingMessageCount: payload.steering.length + payload.followUp.length,
          lastSeen: new Date().toISOString(),
        })
      }).then(f => unsubs.push(f))

      const liveEventNames = [
        'message_start',
        'message_update',
        'message_end',
        'tool_execution_start',
        'tool_execution_update',
        'tool_execution_end',
        'agent_start',
        'agent_end',
        'turn_start',
        'turn_end',
        'model_select',
        'auto_compaction_start',
        'auto_compaction_end',
      ] as const

      for (const eventName of liveEventNames) {
        listen<PiLiveChatEventPayload>(eventName, ({ payload }) => {
          const nextPatch: Partial<PiLiveSession> = {
            lastSeen: new Date().toISOString(),
          }
          if (eventName === 'agent_start') nextPatch.isStreaming = true
          if (eventName === 'agent_end' || eventName === 'turn_end') nextPatch.isStreaming = false

          setSessions((prev) =>
            prev.map((session) =>
              matchesSessionId(session.sessionId, payload.sessionId)
                ? {
                    ...session,
                    ...nextPatch,
                    entryCount: session.entryCount + 1,
                  }
                : session,
            ),
          )
        }).then(f => unsubs.push(f))
      }
    }

    // Initial refresh
    void refresh()
    void setupListeners()

    // Auto refresh
    let intervalId: ReturnType<typeof setInterval> | null = null
    if (refreshInterval > 0) {
      intervalId = setInterval(() => {
        void refresh()
      }, refreshInterval)
    }

    return () => {
      unsubs.forEach(u => u())
      if (intervalId) clearInterval(intervalId)
    }
  }, [isEnabled, manual, refreshInterval, refresh])

  return {
    sessions,
    liveSessionIds,
    connectionState,
    isEnabled,
    showInSidebar,
    settings,
    refresh,
    prompt,
    steer,
    followUp,
    setModel,
    setThinkingLevel,
    getCommands,
    abort,
  }
}

// Compatibility layer
export function usePiLiveSessions() {
  const { sessions, liveSessionIds, refresh } = usePiLive()
  return { sessions, liveSessionIds, refresh }
}
