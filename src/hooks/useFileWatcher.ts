import { useEffect, useRef } from 'react'
import { listen } from '../transport'
import type { SessionsDiff } from '../types'

interface UseFileWatcherOptions {
  enabled?: boolean
  onDiff: (diff: SessionsDiff) => void
  debounceMs?: number
}

/**
 * 文件监听 Hook
 * 后端 file_watcher 增量 rescan 后推送 diff，前端直接 merge，不再调 scan_sessions
 */
export function useFileWatcher({
  enabled = true,
  onDiff,
  debounceMs = 2000,
}: UseFileWatcherOptions) {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const onDiffRef = useRef(onDiff)
  const pendingDiffRef = useRef<SessionsDiff>({ updated: [], removed: [] })

  useEffect(() => {
    onDiffRef.current = onDiff
  }, [onDiff])

  useEffect(() => {
    if (!enabled) return

    let unlisten: (() => void) | null = null

    const setupListener = async () => {
      try {
        unlisten = await listen<SessionsDiff>('sessions-changed', (event) => {
          const diff = event.payload
          if (!diff) return

          // Accumulate diffs within debounce window
          const pending = pendingDiffRef.current
          if (diff.updated?.length) {
            for (const u of diff.updated) {
              const idx = pending.updated.findIndex(s => s.path === u.path)
              if (idx >= 0) pending.updated[idx] = u
              else pending.updated.push(u)
            }
          }
          if (diff.removed?.length) {
            for (const r of diff.removed) {
              if (!pending.removed.includes(r)) pending.removed.push(r)
              // Also remove from pending.updated if it was queued
              pending.updated = pending.updated.filter(s => s.path !== r)
            }
          }

          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
          }

          debounceTimerRef.current = setTimeout(() => {
            const merged = { ...pendingDiffRef.current }
            pendingDiffRef.current = { updated: [], removed: [] }
            if (merged.updated.length || merged.removed.length) {
              onDiffRef.current(merged)
            }
            debounceTimerRef.current = null
          }, debounceMs)
        })
      } catch (error) {
        console.error('[FileWatcher] Failed to setup listener:', error)
      }
    }

    setupListener()

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      pendingDiffRef.current = { updated: [], removed: [] }
      if (unlisten) unlisten()
    }
  }, [enabled, debounceMs])
}
