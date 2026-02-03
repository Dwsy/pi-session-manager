import { useState, useEffect, useCallback, useRef } from 'react'
import type { SessionInfo } from '../types'

interface BadgeState {
  type: 'new' | 'updated'
}

/**
 * Badge 状态管理 Hook
 * 以程序启动时间为基准，追踪启动后新增和更新的会话
 */
export function useSessionBadges(sessions: SessionInfo[]) {
  const [badgeStates, setBadgeStates] = useState<Record<string, BadgeState>>({})
  const baselineRef = useRef<Map<string, SessionInfo> | null>(null)
  const previousSessionsRef = useRef<Map<string, SessionInfo>>(new Map())

  // 检测会话变化并更新 badge 状态
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
      setBadgeStates(prev => ({ ...prev, ...newBadges }))
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
  }, [])

  const clearAllBadges = useCallback(() => {
    setBadgeStates({})
  }, [])

  // 获取指定会话的 badge 类型
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
