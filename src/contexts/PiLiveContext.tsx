/**
 * Pi Live Session Context
 *
 * Manages real-time Pi agent sessions streaming over WebSocket.
 * Multiple Pi processes connect to the same psm WS server,
 * each registering with their sessionId to route live stream entries.
 * 
 * SessionViewer uses this to merge live entries with disk history.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { listen } from '../transport'

export interface LiveSessionEntry {
  eventType: string
  entry: any
  timestamp: number
}

export interface PiLiveSessionInfo {
  sessionId: string
  sessionPath?: string
  pid?: number
  cwd?: string
  entries: LiveSessionEntry[]
  isStreaming: boolean
  model?: any
}

interface PiLiveContextValue {
  sessions: Map<string, PiLiveSessionInfo>
  sessionsSnapshot: PiLiveSessionInfo[]
  getEntries: (sessionId: string) => SessionEntry[]
  isLive: (sessionId: string) => boolean
  isStreaming: (sessionId: string) => boolean
  mergeLiveWithDisk: (diskEntries: SessionEntry[], sessionId: string) => SessionEntry[]
}

type SessionEntry = any

const PiLiveContext = createContext<PiLiveContextValue | null>(null)

// Global shared state (outside React tree)
const sessions = new Map<string, PiLiveSessionInfo>()
const changeListeners = new Set<() => void>()

function bump() {
  changeListeners.forEach(fn => fn())
}

export function usePiLive(): PiLiveContextValue {
  const ctx = useContext(PiLiveContext)
  if (!ctx) throw new Error('usePiLive must be inside PiLiveProvider')
  return ctx
}

export function PiLiveProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<PiLiveSessionInfo[]>([])
  const didSetup = useRef(false)

  useEffect(() => {
    if (didSetup.current) return
    didSetup.current = true

    // Listen for Pi agent registration
    let unlistenRegister: (() => void) | null = null
    let unlistenEntry: (() => void) | null = null

    listen<{ sessionId: string; sessionPath?: string; pid?: number; cwd?: string }>(
      'pi-agent:register',
      ({ payload }) => {
        console.log('[PiLive] pi-agent:register received:', payload)
        const { sessionId, sessionPath, pid, cwd } = payload
        let s = sessions.get(sessionId)
        if (!s) {
          s = { sessionId, sessionPath, pid, cwd, entries: [], isStreaming: false }
          sessions.set(sessionId, s)
        } else {
          if (sessionPath) s.sessionPath = sessionPath
          if (pid) s.pid = pid
          if (cwd) s.cwd = cwd
        }
        bump()
      }
    ).then(f => { unlistenRegister = f }).catch(() => {})

    // Listen for live entries
    listen<{ sessionId: string; eventType: string; entry: any }>(
      'pi-agent:entry',
      ({ payload }) => {
        console.log('[PiLive] pi-agent:entry received:', payload.sessionId, payload.eventType)
        const { sessionId, eventType, entry } = payload
        let s = sessions.get(sessionId)
        if (!s) {
          s = { sessionId, entries: [], isStreaming: false }
          sessions.set(sessionId, s)
        }

        // Update streaming state
        if (eventType === 'agent_start') s.isStreaming = true
        if (eventType === 'agent_end' || eventType === 'turn_end') s.isStreaming = false
        if (eventType === 'model_select') s.model = entry?.model

        // Deduplicate: only append if entry.id not already present
        if (entry?.id) {
          if (!s.entries.some(e => e.entry?.id === entry.id)) {
            s.entries.push({ eventType, entry, timestamp: Date.now() })
          } else {
            // Update existing entry in place
            const idx = s.entries.findIndex(e => e.entry?.id === entry.id)
            if (idx !== -1) {
              s.entries[idx] = { eventType, entry, timestamp: Date.now() }
            }
          }
        } else {
          s.entries.push({ eventType, entry, timestamp: Date.now() })
        }

        bump()
      }
    ).then(f => { unlistenEntry = f }).catch(() => {})

    // Sync Map snapshot to React state
    const unsub = () => setSnapshot(Array.from(sessions.values()))
    changeListeners.add(unsub)
    setSnapshot(Array.from(sessions.values()))
    console.log('[PiLive] Provider initialized, sessions:', sessions.size)

    return () => {
      changeListeners.delete(unsub)
      unlistenRegister?.()
      unlistenEntry?.()
    }
  }, [])

  const getEntries = useCallback((sessionId: string): SessionEntry[] => {
    const s = sessions.get(sessionId)
    if (!s) return []
    // Convert LiveSessionEntry[] → SessionEntry[] format
    return s.entries.map(le => ({
      type: le.eventType,
      ...le.entry,
    }))
  }, [])

  const isLive = useCallback((sessionId: string) => sessions.has(sessionId), [])

  const isStreaming = useCallback((sessionId: string) =>
    sessions.get(sessionId)?.isStreaming ?? false, [])

  const mergeLiveWithDisk = useCallback((diskEntries: SessionEntry[], sessionId: string): SessionEntry[] => {
    const s = sessions.get(sessionId)
    if (!s || s.entries.length === 0) return diskEntries
    const diskIds = new Set(diskEntries.map((e: any) => e.id))
    const newcomers = s.entries
      .filter(le => !diskIds.has(le.entry?.id))
      .map(le => ({ type: le.eventType, ...le.entry }))
    return [...diskEntries, ...newcomers]
  }, [])

  return (
    <PiLiveContext.Provider value={{
      sessions,
      sessionsSnapshot: snapshot,
      getEntries,
      isLive,
      isStreaming,
      mergeLiveWithDisk,
    }}>
      {children}
    </PiLiveContext.Provider>
  )
}

export function useLiveSession(sessionId: string) {
  const ctx = usePiLive()
  const [, forceTick] = useState(0)

  useEffect(() => {
    const unsub = () => forceTick(n => n + 1)
    changeListeners.add(unsub)
    return () => { changeListeners.delete(unsub) }
  }, [sessionId])

  return {
    isLive: ctx.isLive(sessionId),
    isStreaming: ctx.isStreaming(sessionId),
    entries: ctx.getEntries(sessionId),
    merged: (diskEntries: SessionEntry[]) => ctx.mergeLiveWithDisk(diskEntries, sessionId),
  }
}
