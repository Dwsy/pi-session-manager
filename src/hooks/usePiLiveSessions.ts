/**
 * Pi Live Session Hook
 *
 * 从 psm Rust 后端查询 live session 列表,前端不维护状态。
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { invoke, listen } from '../transport'

export interface LiveSessionInfo {
  session_id: string
  session_path?: string
  pid?: number
  cwd?: string
  is_streaming: boolean
  entry_count: number
  last_seen: string
  model?: any
  thinking_level?: string
  context_usage?: any
}

export function usePiLiveSessions() {
  const [sessions, setSessions] = useState<LiveSessionInfo[]>([])

  // 创建 live session 匹配集合
  // 后端 session_id 格式: 2026-04-03T07-41-22-202Z_b658839d-af77-4944-94b7-956c993988f3
  // 前端 session.id 格式: b658839d-af77-4944-94b7-956c993988f3
  // 需要取 session_id 最后一段 UUID 来匹配
  const liveSessionIds = useMemo(() => {
    const ids = new Set<string>()
    for (const s of sessions) {
      const sid = s.session_id
      const uuidMatch = sid.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      if (uuidMatch) ids.add(uuidMatch[0])
    }
    return ids
  }, [sessions])

  const refresh = useCallback(async () => {
    try {
      const result = await invoke<LiveSessionInfo[]>('get_pi_live_sessions')
      setSessions(result)
    } catch {
      // 后端可能未就绪
    }
  }, [])

  useEffect(() => {
    refresh()

    // 当有新注册或新条目时刷新
    const unsubs: (() => void)[] = []
    listen('pi-agent:register', () => refresh()).then(f => unsubs.push(f))
    listen('pi-agent:entry', () => refresh()).then(f => unsubs.push(f))
    listen('pi-agent:session_state', () => refresh()).then(f => unsubs.push(f))

    return () => { unsubs.forEach(u => u()) }
  }, [refresh])

  return { sessions, liveSessionIds, refresh }
}
