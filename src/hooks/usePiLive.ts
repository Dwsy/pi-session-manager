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
  PiLiveConnectionState,
  PiLiveSettings,
} from '@/types/pi-live'

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
  /** Send steering message */
  steer: (sessionId: string, message: string) => Promise<void>
  /** Send prompt message */
  sendMessage: (sessionId: string, message: string, streamingBehavior?: string) => Promise<void>
  /** Set model */
  setModel: (sessionId: string, provider: string, modelId: string) => Promise<void>
  /** Set thinking level */
  setThinkingLevel: (sessionId: string, level: string) => Promise<void>
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

  // Create UUID set for fast matching
  const liveSessionIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of sessions) {
      const uuidMatch = s.session_id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
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
  const steer = useCallback(async (sessionId: string, message: string) => {
    await invoke('pi_agent_steering', { sessionId, message, deliverAs: 'steer' })
  }, [])

  const sendMessage = useCallback(async (sessionId: string, message: string, streamingBehavior = 'steer') => {
    await invoke('pi_agent_send_message', { sessionId, message, streamingBehavior })
  }, [])

  const setModel = useCallback(async (sessionId: string, provider: string, modelId: string) => {
    await invoke('pi_agent_set_model', { sessionId, provider, modelId })
  }, [])

  const setThinkingLevel = useCallback(async (sessionId: string, level: string) => {
    await invoke('pi_agent_set_thinking', { sessionId, level })
  }, [])

  const abort = useCallback(async (sessionId: string) => {
    await invoke('pi_agent_abort', { sessionId })
  }, [])

  // Listen to events
  useEffect(() => {
    if (!isEnabled || manual) return

    const unsubs: (() => void)[] = []

    const setupListeners = async () => {
      // Register event
      listen('pi-agent:register', () => {
        setConnectionState('connected')
        void refresh()
      }).then(f => unsubs.push(f))

      // Disconnect event
      listen('pi-agent:disconnect', () => {
        setConnectionState('disconnected')
        void refresh()
      }).then(f => unsubs.push(f))

      // Entry event
      listen('pi-agent:entry', () => {
        void refresh()
      }).then(f => unsubs.push(f))

      // State update event
      listen('pi-agent:session_state', () => {
        void refresh()
      }).then(f => unsubs.push(f))
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
    steer,
    sendMessage,
    setModel,
    setThinkingLevel,
    abort,
  }
}

// Compatibility layer
export function usePiLiveSessions() {
  const { sessions, liveSessionIds, refresh } = usePiLive()
  return { sessions, liveSessionIds, refresh }
}
