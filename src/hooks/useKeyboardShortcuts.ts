import { useEffect, useRef } from 'react'

interface Shortcuts {
  [key: string]: () => void
}

/**
 * 键盘快捷键 Hook
 * 优化：使用 ref 存储 shortcuts，避免每次渲染都重新绑定事件
 */
export function useKeyboardShortcuts(shortcuts: Shortcuts) {
  // 使用 ref 存储 shortcuts，避免每次渲染都重新绑定事件
  const shortcutsRef = useRef(shortcuts)

  // 更新 ref 中的 shortcuts
  useEffect(() => {
    shortcutsRef.current = shortcuts
  }, [shortcuts])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 在输入框中不触发快捷键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const key = `${e.metaKey || e.ctrlKey ? 'cmd+' : ''}${e.altKey ? 'alt+' : ''}${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`

      // 从 ref 中获取最新的 shortcuts
      const handler = shortcutsRef.current[key]
      if (handler) {
        e.preventDefault()
        handler()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // 空依赖数组，只在挂载时绑定一次
}