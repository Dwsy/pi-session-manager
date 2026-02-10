import { useEffect, useRef } from 'react'
import { listen } from '../transport'

interface UseFileWatcherOptions {
  enabled?: boolean
  onSessionsChanged: () => void
  debounceMs?: number // 防抖时间（毫秒）
}

/**
 * 文件监听 Hook
 * 监听后端的文件变化事件，触发会话列表刷新
 * 带防抖机制，避免频繁刷新
 */
export function useFileWatcher({
  enabled = true,
  onSessionsChanged,
  debounceMs = 2000, // 默认 2 秒防抖
}: UseFileWatcherOptions) {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const onSessionsChangedRef = useRef(onSessionsChanged)

  // 保持回调引用最新
  useEffect(() => {
    onSessionsChangedRef.current = onSessionsChanged
  }, [onSessionsChanged])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let unlisten: (() => void) | null = null

    const setupListener = async () => {
      try {
        unlisten = await listen('sessions-changed', (_event) => {
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
          }

          debounceTimerRef.current = setTimeout(() => {
            onSessionsChangedRef.current()
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

      if (unlisten) {
        unlisten()
      }
    }
  }, [enabled, debounceMs])
}
