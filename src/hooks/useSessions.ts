import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '../transport'
import { useTranslation } from 'react-i18next'
import type { SessionInfo, SessionsDiff } from '../types'
import { useDemoMode } from './useDemoMode'

export interface UseSessionsReturn {
  sessions: SessionInfo[]
  loading: boolean
  selectedSession: SessionInfo | null
  setSelectedSession: (session: SessionInfo | null) => void
  loadSessions: () => Promise<void>
  patchSessions: (diff: SessionsDiff) => void
  handleDeleteSession: (session: SessionInfo) => Promise<void>
  handleRenameSession: (session: SessionInfo, newName: string) => Promise<void>
}

export function useSessions(): UseSessionsReturn {
  const { t } = useTranslation()
  const { isDemoMode, getDemoSessions } = useDemoMode()
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(true)
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
      alert(`${t('app.errors.loadSessions')}: ${error}`)
    } finally {
      setLoading(false)
    }
  }, [t, isDemoMode, getDemoSessions])

  const patchSessions = useCallback((diff: SessionsDiff) => {
    setSessions(prev => {
      const removedSet = new Set(diff.removed)
      let next = prev.filter(s => !removedSet.has(s.path))

      for (const u of diff.updated) {
        const idx = next.findIndex(s => s.path === u.path)
        if (idx >= 0) {
          next[idx] = u
        } else {
          next.push(u)
        }
      }

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
    if (!confirm(t('app.confirm.deleteSession', { name: session.name || t('common.untitled') }))) {
      return
    }

    try {
      if (isDemoMode) {
        // In demo mode, just remove from local state
        setSessions(prev => prev.filter(s => s.id !== session.id))
      } else {
        await invoke('delete_session', { path: session.path })
        setSessions(prev => prev.filter(s => s.id !== session.id))
      }
      if (selectedSession?.id === session.id) {
        setSelectedSession(null)
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
      alert(t('app.errors.deleteSession'))
    }
  }, [selectedSession, t, isDemoMode])

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
    handleRenameSession,
  }
}
