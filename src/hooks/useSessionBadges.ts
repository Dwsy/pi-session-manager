import { useState, useEffect, useCallback, useRef } from 'react'
import type { SessionInfo } from '../types'

interface BadgeState {
  type: 'new' | 'updated'
}

/**
 * Badge state management hook
 * Tracks new and updated sessions since app startup
 */
export function useSessionBadges(sessions: SessionInfo[]) {
  const [badgeStates, setBadgeStates] = useState<Record<string, BadgeState>>({})
  const baselineRef = useRef<Map<string, SessionInfo> | null>(null)
  const previousSessionsRef = useRef<Map<string, SessionInfo>>(new Map())

  // Detect session changes and update badge status
  useEffect(() => {
    if (sessions.length === 0) {
      return
    }

    if (baselineRef.current === null) {
      const baseline = new Map<string, SessionInfo>()
      for (const session of sessions) {
        baseline.set(session.id, session)
      }
      baselineRef.current = baseline
      previousSessionsRef.current = baseline
      return
    }

    const baseline = baselineRef.current
    const previousSessions = previousSessionsRef.current
    const newBadges: Record<string, BadgeState> = {}

    for (const session of sessions) {
      const baselineSession = baseline.get(session.id)
      const prevSession = previousSessions.get(session.id)

      if (!baselineSession) {
        newBadges[session.id] = { type: 'new' }
      } else if (prevSession && session.message_count > prevSession.message_count) {
        newBadges[session.id] = { type: 'updated' }
      }
    }

    if (Object.keys(newBadges).length > 0) {
      setBadgeStates(prev => {
        let changed = false
        const next = { ...prev }

        for (const [sessionId, badge] of Object.entries(newBadges)) {
          if (prev[sessionId]?.type === badge.type) {
            continue
          }
          next[sessionId] = badge
          changed = true
        }

        return changed ? next : prev
      })
    }

    const newPreviousSessions = new Map<string, SessionInfo>()
    for (const session of sessions) {
      newPreviousSessions.set(session.id, session)
    }
    previousSessionsRef.current = newPreviousSessions
  }, [sessions])

  const clearBadge = useCallback((sessionId: string) => {
    setBadgeStates(prev => {
      const newStates = { ...prev }
      delete newStates[sessionId]
      return newStates
    })

    // Also update baseline to prevent badge from reappearing after incremental updates
    const session = sessions.find(s => s.id === sessionId)
    if (session && baselineRef.current) {
      baselineRef.current.set(sessionId, session)
    }
  }, [sessions])

  const clearAllBadges = useCallback(() => {
    setBadgeStates({})
  }, [])

  // Get badge type for specified session
  const getBadgeType = useCallback((sessionId: string): 'new' | 'updated' | null => {
    return badgeStates[sessionId]?.type || null
  }, [badgeStates])

  return {
    badgeStates,
    getBadgeType,
    clearBadge,
    clearAllBadges,
  }
}
