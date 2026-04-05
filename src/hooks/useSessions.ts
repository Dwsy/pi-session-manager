import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke, listen } from '@/transport'
import { useTranslation } from 'react-i18next'
import type { SessionInfo, SessionsDiff } from '@/types'
import { useDemoMode } from './useDemoMode'
import { deleteDemoSessions, renameDemoSession } from '@/demo'

export interface PendingDeleteSession {
  sessions: SessionInfo[]
  requestedAt: number
  anchorRef?: React.RefObject<HTMLElement>
}

interface DeleteSessionsResult {
  deleted_count: number
  failed: Array<{ path: string; error: string }>
}

export interface UseSessionsReturn {
  sessions: SessionInfo[]
  loading: boolean
  selectedSession: SessionInfo | null
  setSelectedSession: (session: SessionInfo | null) => void
  loadSessions: () => Promise<void>
  patchSessions: (diff: SessionsDiff) => void
  handleDeleteSession: (session: SessionInfo) => Promise<void>
  handleDeleteSessions: (sessions: SessionInfo[], anchorRef?: React.RefObject<HTMLElement>) => Promise<void>
  pendingDeleteSession: PendingDeleteSession | null
  confirmDeleteSession: () => Promise<void>
  cancelDeleteSession: () => void
  handleRenameSession: (session: SessionInfo, newName: string) => Promise<void>
  forkSession: (sourcePath: string, targetName?: string) => Promise<SessionInfo | null>
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
        const [scanned, live] = await Promise.all([
          invoke<SessionInfo[]>('scan_sessions'),
          invoke<any[]>('get_pi_live_sessions')
        ])

        // Merge scanned with live
        const liveMap = new Map(live.map(l => [l.session_id, l]))
        const visitedLiveIds = new Set<string>()

        loadedSessions = scanned.map(s => {
          const liveInfo = liveMap.get(s.id)
          if (liveInfo) {
            visitedLiveIds.add(s.id)
            return { ...s, isLive: true, pid: liveInfo.pid }
          }
          return s
        })

        // Add live sessions that aren't scanned yet (new sessions)
        for (const l of live) {
          if (!visitedLiveIds.has(l.session_id)) {
            loadedSessions.push({
              id: l.session_id,
              path: l.session_path || l.session_id,
              name: l.session_id,
              modified: l.last_seen,
              message_count: l.entry_count,
              last_message: "",
              last_message_role: "assistant",
              isLive: true,
              pid: l.pid,
              cwd: l.cwd || "",
              first_message: "",
              created: "",
            })
          }
        }

        loadedSessions.sort((a, b) => b.modified.localeCompare(a.modified))
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

  const handleDeleteSessions = useCallback(async (targets: SessionInfo[], anchorRef?: React.RefObject<HTMLElement>) => {
    const nextTargets: SessionInfo[] = []
    const seen = new Set<string>()

    for (const session of targets) {
      if (!session || seen.has(session.id)) {
        continue
      }
      seen.add(session.id)
      nextTargets.push(session)
    }

    if (nextTargets.length === 0) {
      return
    }

    setPendingDeleteSession({
      sessions: nextTargets,
      requestedAt: Date.now(),
      anchorRef,
    })
  }, [])

  const handleDeleteSession = useCallback(async (session: SessionInfo, anchorRef?: React.RefObject<HTMLElement>) => {
    await handleDeleteSessions([session], anchorRef)
  }, [handleDeleteSessions])

  const confirmDeleteSession = useCallback(async () => {
    if (!pendingDeleteSession) {
      return
    }

    const targetSessions = pendingDeleteSession.sessions
    const targetSessionIds = new Set(targetSessions.map(session => session.id))
    let deletedSessionIds = targetSessionIds

    try {
      if (isDemoMode) {
        deleteDemoSessions(targetSessions.map(session => session.path))
        setSessions(prev => prev.filter(s => !targetSessionIds.has(s.id)))
      } else {
        const result = await invoke<DeleteSessionsResult>('delete_sessions', {
          paths: targetSessions.map(session => session.path),
        })

        const failedPaths = new Set(result.failed.map(item => item.path))
        deletedSessionIds = new Set(
          targetSessions
            .filter(session => !failedPaths.has(session.path))
            .map(session => session.id)
        )

        if (deletedSessionIds.size > 0) {
          setSessions(prev => prev.filter(session => !deletedSessionIds.has(session.id)))
        }

        if (result.failed.length > 0) {
          console.error('Failed to delete some sessions:', result.failed)
          alert(t('app.errors.deleteSessionPartial', {
            count: result.failed.length,
            defaultValue: '{{count}} sessions failed to delete. Check the console for details.',
          }))
        }
      }

      if (selectedSessionRef.current?.id && deletedSessionIds.has(selectedSessionRef.current.id)) {
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
        const updated = renameDemoSession(session.path, newName)
        setSessions(prev => prev.map(s =>
          s.id === session.id
            ? { ...s, name: newName, modified: updated?.modified || s.modified }
            : s
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

  const forkSession = useCallback(async (sourcePath: string, targetName?: string): Promise<SessionInfo | null> => {
    try {
      if (isDemoMode) {
        // Demo mode doesn't support fork
        console.warn('Fork is not supported in demo mode')
        return null
      }

      const newSession = await invoke<SessionInfo>('fork_session', {
        source_path: sourcePath,
        target_name: targetName || null
      })

      // Add the new session to the list
      setSessions(prev => {
        const updated = [newSession, ...prev]
        updated.sort((a, b) => b.modified.localeCompare(a.modified))
        return updated
      })

      return newSession
    } catch (error) {
      console.error('Failed to fork session:', error)
      alert(t('app.errors.forkSession', { defaultValue: 'Failed to fork session' }))
      return null
    }
  }, [isDemoMode, t])

  useEffect(() => {
    if (isDemoMode) return

    let unlisten: (() => void) | null = null
    const setupSubscriptions = async () => {
      const u1 = await listen('pi-agent:register', () => loadSessions())
      const u2 = await listen('pi-agent:disconnect', () => loadSessions())
      const u3 = await listen('sessions-changed', () => loadSessions())
      unlisten = () => { if (u1) u1(); if (u2) u2(); if (u3) u3() }
    }

    setupSubscriptions()
    return () => { if (unlisten) unlisten() }
  }, [isDemoMode, loadSessions])

  return {
    sessions,
    loading,
    selectedSession,
    setSelectedSession,
    loadSessions,
    patchSessions,
    handleDeleteSession,
    handleDeleteSessions,
    pendingDeleteSession,
    confirmDeleteSession,
    cancelDeleteSession,
    handleRenameSession,
    forkSession,
  }
}
