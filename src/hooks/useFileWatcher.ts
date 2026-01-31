import { useEffect } from 'react'
import { listen, UnlistenFn } from '@tauri-apps/api/event'

interface UseFileWatcherOptions {
  enabled?: boolean
  onSessionsChanged: () => void
}

/**
 * 文件监听 Hook
 * 监听后端的文件变化事件，触发会话列表刷新
 */
export function useFileWatcher({
  enabled = true,
  onSessionsChanged,
}: UseFileWatcherOptions) {
  useEffect(() => {
    if (!enabled) {
      return
    }

    let unlisten: UnlistenFn | null = null

    // 监听后端的 sessions-changed 事件
    const setupListener = async () => {
      try {
        unlisten = await listen('sessions-changed', () => {
          console.log('[FileWatcher] Sessions changed, triggering refresh...')
          onSessionsChanged()
        })
        console.log('[FileWatcher] Listener setup complete')
      } catch (error) {
        console.error('[FileWatcher] Failed to setup listener:', error)
      }
    }

    setupListener()

    // 清理监听器
    return () => {
      if (unlisten) {
        unlisten()
        console.log('[FileWatcher] Listener cleaned up')
      }
    }
  }, [enabled, onSessionsChanged])
}
