import { useState, useEffect, useCallback, useRef } from 'react'
import type { SessionInfo } from '../types'

interface BadgeState {
  type: 'new' | 'updated'
  timestamp: number
}

const STORAGE_KEY = 'pi-session-manager-badge-states'
const BADGE_EXPIRY = 24 * 60 * 60 * 1000 // 24 小时后自动过期

/**
 * Badge 状态管理 Hook
 * 追踪会话的新增和更新状态
 */
export function useSessionBadges(sessions: SessionInfo[]) {
  const [badgeStates, setBadgeStates] = useState<Record<string, BadgeState>>({})
  const previousSessionsRef = useRef<Map<string, SessionInfo>>(new Map())
  const isInitializedRef = useRef(false)

  // 从 localStorage 加载 badge 状态
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, BadgeState>
        // 清理过期的 badge
        const now = Date.now()
        const filtered = Object.fromEntries(
          Object.entries(parsed).filter(([_, state]) => now - state.timestamp < BADGE_EXPIRY)
        )
        setBadgeStates(filtered)
        console.log('[BadgeManager] Loaded', Object.keys(filtered).length, 'badges from storage')
      }
    } catch (error) {
      console.error('[BadgeManager] Failed to load badge states:', error)
    }
  }, [])

  // 保存 badge 状态到 localStorage
  const saveBadgeStates = useCallback((states: Record<string, BadgeState>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(states))
    } catch (error) {
      console.error('[BadgeManager] Failed to save badge states:', error)
    }
  }, [])

  // 检测会话变化并更新 badge 状态
  useEffect(() => {
    // 首次加载：初始化 previousSessions，但不标记任何 badge
    if (!isInitializedRef.current) {
      console.log('[BadgeManager] Initial load, setting baseline with', sessions.length, 'sessions')
      const initialSessions = new Map<string, SessionInfo>()
      for (const session of sessions) {
        initialSessions.set(session.id, session)
      }
      previousSessionsRef.current = initialSessions
      isInitializedRef.current = true
      return
    }

    const newBadgeStates = { ...badgeStates }
    const previousSessions = previousSessionsRef.current
    let hasChanges = false

    // 检测新增和更新的会话
    for (const session of sessions) {
      const prevSession = previousSessions.get(session.id)
      
      if (!prevSession) {
        // 新会话：首次出现（在初始化之后）
        if (!badgeStates[session.id]) {
          console.log('[BadgeManager] 🆕 New session detected:', session.id, session.name || session.first_message.substring(0, 50))
          newBadgeStates[session.id] = {
            type: 'new',
            timestamp: Date.now(),
          }
          hasChanges = true
        }
      } else {
        // 检测更新的会话（message_count 增加或 modified 时间变化）
        const messageCountChanged = session.message_count > prevSession.message_count
        const modifiedChanged = new Date(session.modified).getTime() > new Date(prevSession.modified).getTime()
        
        if (messageCountChanged || modifiedChanged) {
          // 会话已更新，但不覆盖 'new' 状态
          if (!badgeStates[session.id] || badgeStates[session.id].type !== 'new') {
            console.log('[BadgeManager] 🔄 Session updated:', session.id, {
              messageCount: `${prevSession.message_count} -> ${session.message_count}`,
              modified: modifiedChanged ? 'changed' : 'same'
            })
            newBadgeStates[session.id] = {
              type: 'updated',
              timestamp: Date.now(),
            }
            hasChanges = true
          }
        }
      }
    }

    if (hasChanges) {
      console.log('[BadgeManager] Badge states updated:', Object.keys(newBadgeStates).length, 'total badges')
      setBadgeStates(newBadgeStates)
      saveBadgeStates(newBadgeStates)
    }

    // 更新 previousSessions
    const newPreviousSessions = new Map<string, SessionInfo>()
    for (const session of sessions) {
      newPreviousSessions.set(session.id, session)
    }
    previousSessionsRef.current = newPreviousSessions
  }, [sessions, badgeStates, saveBadgeStates])

  // 清除指定会话的 badge
  const clearBadge = useCallback((sessionId: string) => {
    console.log('[BadgeManager] Clearing badge for session:', sessionId)
    setBadgeStates(prev => {
      const newStates = { ...prev }
      delete newStates[sessionId]
      saveBadgeStates(newStates)
      return newStates
    })
  }, [saveBadgeStates])

  // 清除所有 badge
  const clearAllBadges = useCallback(() => {
    console.log('[BadgeManager] Clearing all badges')
    setBadgeStates({})
    saveBadgeStates({})
  }, [saveBadgeStates])

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
