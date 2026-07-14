import { useEffect, useRef } from 'react'

interface Shortcuts {
  [key: string]: () => void
}

interface UseKeyboardShortcutsOptions {
  shouldHandleEvent?: (event: KeyboardEvent) => boolean
  allowInTextEntry?: string[]
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
  const allowInTextEntryRef = useRef(new Set(options?.allowInTextEntry ?? []))

  // Update shortcuts in ref
  useEffect(() => {
    shortcutsRef.current = shortcuts
  }, [shortcuts])

  useEffect(() => {
    shouldHandleEventRef.current = options?.shouldHandleEvent
  }, [options?.shouldHandleEvent])

  useEffect(() => {
    allowInTextEntryRef.current = new Set(options?.allowInTextEntry ?? [])
  }, [options?.allowInTextEntry])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) {
        return
      }

      if (e.isComposing || e.keyCode === 229 || e.getModifierState?.("AltGraph")) {
        return
      }

      const key = `${e.metaKey || e.ctrlKey ? 'cmd+' : ''}${e.altKey ? 'alt+' : ''}${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`

      if (isTextEntryTarget(e.target) && !allowInTextEntryRef.current.has(key)) {
        return
      }

      if (shouldHandleEventRef.current && !shouldHandleEventRef.current(e)) {
        return
      }

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
