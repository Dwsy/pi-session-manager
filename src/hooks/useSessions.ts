import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '../transport'
import { useTranslation } from 'react-i18next'
import type { SessionInfo, SessionsDiff } from '../types'
import { useDemoMode } from './useDemoMode'

export interface PendingDeleteSession {
  session: SessionInfo
  requestedAt: number
}

export interface UseSessionsReturn {
  sessions: SessionInfo[]
  loading: boolean
  selectedSession: SessionInfo | null
  setSelectedSession: (session: SessionInfo | null) => void
  loadSessions: () => Promise<void>
  patchSessions: (diff: SessionsDiff) => void
  handleDeleteSession: (session: SessionInfo) => Promise<void>
  pendingDeleteSession: PendingDeleteSession | null
  confirmDeleteSession: () => Promise<void>
  cancelDeleteSession: () => void
  handleRenameSession: (session: SessionInfo, newName: string) => Promise<void>
}

export function useSessions(): UseSessionsReturn {
  const { t } = useTranslation()
  const { isDemoMode, getDemoSessions } = useDemoMode()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingDeleteSession, setPendingDeleteSession] = useState<PendingDeleteSession | null>(null)
  const selectedSessionRef = useRef<SessionInfo | null>(null)

  useEffect(() => {
    selectedSessionRef.current = selectedSession
  }, [selectedSession])

  const loadSessions = useCallback(async () => {
    try {
      let loadedSessions: SessionInfo[] = []
      if (isDemoMode) {
        loadedSessions = getDemoSessions()
      } else {
        loadedSessions = await invoke<SessionInfo[]>('scan_sessions')
      }
      setSessions(loadedSessions)

      const currentSelection = selectedSessionRef.current
      if (currentSelection) {
        const matchedByPath = loadedSessions.find(s => s.path === currentSelection.path)
        const matchedById = loadedSessions.find(s => s.id === currentSelection.id)
        const matched = matchedByPath || matchedById

        if (matched) {
          const pathChanged = matched.path !== currentSelection.path
          const nameChanged = matched.name !== currentSelection.name
          const hasChanges = pathChanged || nameChanged ||
            matched.message_count !== currentSelection.message_count ||
            matched.modified !== currentSelection.modified

          if (!hasChanges) {
            // No changes detected, keeping current selection stable
          } else if (pathChanged || nameChanged) {
            setSelectedSession(matched)
          } else {
            // Session metadata changed, updating silently
            setSelectedSession(prev => {
              if (!prev) return matched
              return { ...prev, ...matched }
            })
          }
        } else {
          try {
            if (isDemoMode) {
              // Demo mode doesn't need to check file existence
              setSelectedSession(currentSelection)
            } else {
              await invoke('read_session_file', { path: currentSelection.path })
              // Selected session file still readable but not in scan results, keeping selection
            }
          } catch (error) {
            console.warn('[useSessions] Selected session file not readable, clearing selection:', error)
            setSelectedSession(null)
          }
        }
      }
    } catch (error) {
      console.error('[useSessions] Failed to load sessions:', error)
      // Don't alert on mobile — connection errors are common on first load
    } finally {
      setLoading(false)
    }
  }, [t, isDemoMode, getDemoSessions])

  const patchSessions = useCallback((diff: SessionsDiff) => {
    setSessions(prev => {
      const removedSet = new Set(diff.removed)
      let changed = diff.removed.length > 0 && prev.some(s => removedSet.has(s.path))

      let next = changed ? prev.filter(s => !removedSet.has(s.path)) : [...prev]

      for (const u of diff.updated) {
        const idx = next.findIndex(s => s.path === u.path)
        if (idx >= 0) {
          // Only replace if something actually changed
          const existing = next[idx]
          if (existing.modified !== u.modified
            || existing.message_count !== u.message_count
            || existing.name !== u.name
            || existing.last_message !== u.last_message) {
            next[idx] = u
            changed = true
          }
        } else {
          next.push(u)
          changed = true
        }
      }

      if (!changed) return prev

      next.sort((a, b) => b.modified.localeCompare(a.modified))
      return next
    })

    // Update selected session if it was in the diff
    const currentSelection = selectedSessionRef.current
    if (currentSelection) {
      const removedSet = new Set(diff.removed)
      if (removedSet.has(currentSelection.path)) {
        setSelectedSession(null)
      } else {
        const updated = diff.updated.find(s => s.path === currentSelection.path)
        if (updated) {
          setSelectedSession(prev => prev ? { ...prev, ...updated } : null)
        }
      }
    }
  }, [])

  const handleDeleteSession = useCallback(async (session: SessionInfo) => {
    setPendingDeleteSession({
      session,
      requestedAt: Date.now(),
    })
  }, [])

  const confirmDeleteSession = useCallback(async () => {
    if (!pendingDeleteSession) {
      return
    }

    const targetSession = pendingDeleteSession.session

    try {
      if (isDemoMode) {
        setSessions(prev => prev.filter(s => s.id !== targetSession.id))
      } else {
        await invoke('delete_session', { path: targetSession.path })
        setSessions(prev => prev.filter(s => s.id !== targetSession.id))
      }

      if (selectedSessionRef.current?.id === targetSession.id) {
        setSelectedSession(null)
      }

      setPendingDeleteSession(null)
    } catch (error) {
      console.error('Failed to delete session:', error)
      alert(t('app.errors.deleteSession'))
    }
  }, [isDemoMode, pendingDeleteSession, t])

  const cancelDeleteSession = useCallback(() => {
    setPendingDeleteSession(null)
  }, [])

  const handleRenameSession = useCallback(async (session: SessionInfo, newName: string) => {
    try {
      if (isDemoMode) {
        // In demo mode, just update local state
        setSessions(prev => prev.map(s =>
          s.id === session.id ? { ...s, name: newName } : s
        ))
      } else {
        await invoke('rename_session', {
          path: session.path,
          new_name: newName
        })
        setSessions(prev => prev.map(s =>
          s.id === session.id ? { ...s, name: newName } : s
        ))
      }

      if (selectedSession?.id === session.id) {
        setSelectedSession(prev => prev ? { ...prev, name: newName } : null)
      }
    } catch (error) {
      console.error('Failed to rename session:', error)
      alert(t('app.errors.renameSession'))
    }
  }, [selectedSession, t, isDemoMode])

  return {
    sessions,
    loading,
    selectedSession,
    setSelectedSession,
    loadSessions,
    patchSessions,
    handleDeleteSession,
    pendingDeleteSession,
    confirmDeleteSession,
    cancelDeleteSession,
    handleRenameSession,
  }
}
