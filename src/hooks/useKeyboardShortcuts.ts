import { useEffect, useRef } from 'react'

interface Shortcuts {
  [key: string]: () => void
}

/**
 * Keyboard shortcuts hook
 * Optimization: store shortcuts in refs to avoid rebinding on each render
 * 
 * Note: the terminal intercepts shortcuts with attachCustomKeyEventHandler,
 * Therefore global shortcuts do not conflict with terminal shortcuts
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