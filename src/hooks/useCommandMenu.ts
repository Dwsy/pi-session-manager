import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { SearchPluginResult } from '@/plugins/types'

/** Overlay enter/exit animation duration; state resets wait for it to finish. */
export const PALETTE_ANIMATION_MS = 320

type PaletteListener = () => void

// Module-level open state so any caller (sidebar button, future menus) can
// open the palette without synthesizing keyboard events.
let paletteOpen = false
const paletteListeners = new Set<PaletteListener>()

function setPaletteOpen(next: boolean) {
  if (paletteOpen === next) return
  paletteOpen = next
  for (const listener of paletteListeners) listener()
}

export const commandPaletteStore = {
  isOpen: () => paletteOpen,
  open: () => setPaletteOpen(true),
  close: () => setPaletteOpen(false),
  toggle: () => setPaletteOpen(!paletteOpen),
  subscribe(listener: PaletteListener) {
    paletteListeners.add(listener)
    return () => {
      paletteListeners.delete(listener)
    }
  },
}

interface UseCommandMenuReturn {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
  query: string
  setQuery: (query: string) => void
  results: SearchPluginResult[]
  setResults: (results: SearchPluginResult[]) => void
  isSearching: boolean
  setIsSearching: (isSearching: boolean) => void
  reset: () => void
}

/**
 * Command menu state management hook.
 * Open state is backed by the shared module-level store; query/results live
 * in the hook instance (only CommandPalette mounts it) and are reset after
 * the close animation when no one reopens within PALETTE_ANIMATION_MS.
 */
export function useCommandMenu(): UseCommandMenuReturn {
  const isOpen = useSyncExternalStore(commandPaletteStore.subscribe, commandPaletteStore.isOpen)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchPluginResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevOpenRef = useRef(false)

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
  }, [])

  const scheduleReset = useCallback(() => {
    clearResetTimer()
    resetTimerRef.current = setTimeout(() => {
      setQuery('')
      setResults([])
      setIsSearching(false)
      resetTimerRef.current = null
    }, PALETTE_ANIMATION_MS)
  }, [clearResetTimer])

  const open = useCallback(() => {
    commandPaletteStore.open()
  }, [])

  const close = useCallback(() => {
    commandPaletteStore.close()
  }, [])

  const toggle = useCallback(() => {
    commandPaletteStore.toggle()
  }, [])

  const reset = useCallback(() => {
    clearResetTimer()
    setQuery('')
    setResults([])
    setIsSearching(false)
  }, [clearResetTimer])

  // React to any open/close source (keyboard, sidebar button) the same way:
  // reopening cancels the pending reset; closing schedules it.
  useEffect(() => {
    const sync = () => {
      const now = commandPaletteStore.isOpen()
      if (now && !prevOpenRef.current) clearResetTimer()
      if (!now && prevOpenRef.current) scheduleReset()
      prevOpenRef.current = now
    }
    sync()
    return commandPaletteStore.subscribe(sync)
  }, [clearResetTimer, scheduleReset])

  useEffect(() => {
    return () => {
      clearResetTimer()
    }
  }, [clearResetTimer])

  return {
    isOpen,
    open,
    close,
    toggle,
    query,
    setQuery,
    results,
    setResults,
    isSearching,
    setIsSearching,
    reset
  }
}
