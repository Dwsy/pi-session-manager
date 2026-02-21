import { useEffect, useRef } from 'react'

interface Shortcuts {
  [key: string]: () => void
}

/**
 * 键盘快捷键 Hook
 * 优化：使用 ref 存储 shortcuts，避免每次渲染都重新绑定事件
 * 
 * 注意：终端内使用 attachCustomKeyEventHandler 拦截快捷键，
 * 因此全局快捷键不会与终端快捷键冲突
 */
export function useKeyboardShortcuts(shortcuts: Shortcuts) {
  // Use ref to store shortcuts, avoid rebinding events on every render
  const shortcutsRef = useRef(shortcuts)

  // Update shortcuts in ref
  useEffect(() => {
    shortcutsRef.current = shortcuts
  }, [shortcuts])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      const key = `${e.metaKey || e.ctrlKey ? 'cmd+' : ''}${e.altKey ? 'alt+' : ''}${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`

      // Get latest shortcuts from ref
      const handler = shortcutsRef.current[key]
      if (handler) {
        e.preventDefault()
        handler()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // Empty dependency array, bind only once on mount
}