import { useEffect, useRef } from 'react'

interface Shortcuts {
  [key: string]: () => void
}

interface UseKeyboardShortcutsOptions {
  shouldHandleEvent?: (event: KeyboardEvent) => boolean
}

export const isTextEntryTarget = (target: EventTarget | null): boolean => {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return true
  }

  return target instanceof HTMLElement && target.isContentEditable
}

/**
 * Keyboard shortcuts hook
 * Optimization: store shortcuts in refs to avoid rebinding on each render
 *
 * Note: the terminal intercepts shortcuts with attachCustomKeyEventHandler,
 * Therefore global shortcuts do not conflict with terminal shortcuts
 */
export function useKeyboardShortcuts(shortcuts: Shortcuts, options?: UseKeyboardShortcutsOptions) {
  // Use ref to store shortcuts, avoid rebinding events on every render
  const shortcutsRef = useRef(shortcuts)

  const shouldHandleEventRef = useRef(options?.shouldHandleEvent)

  // Update shortcuts in ref
  useEffect(() => {
    shortcutsRef.current = shortcuts
  }, [shortcuts])

  useEffect(() => {
    shouldHandleEventRef.current = options?.shouldHandleEvent
  }, [options?.shouldHandleEvent])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) {
        return
      }

      if (isTextEntryTarget(e.target)) {
        return
      }

      if (shouldHandleEventRef.current && !shouldHandleEventRef.current(e)) {
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
