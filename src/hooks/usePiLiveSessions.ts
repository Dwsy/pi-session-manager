/**
 * Pi Live Session Hook
 * 
 * 从 psm Rust 后端查询 live session 列表，前端不维护状态。
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
}

export function usePiLiveSessions() {
  const [sessions, setSessions] = useState<LiveSessionInfo[]>([])
  
  // 创建 session_id 集合，方便快速查找
  const liveSessionIds = useMemo(() => {
    return new Set(sessions.map(s => s.session_id))
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

    return () => { unsubs.forEach(u => u()) }
  }, [refresh])

  return { sessions, liveSessionIds, refresh }
}
