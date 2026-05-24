import { useState, useCallback, useEffect, useRef } from 'react'
import type { SearchPluginResult } from '@/plugins/types'

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
  selectedIndex: number
  setSelectedIndex: (index: number) => void
  reset: () => void
}

/**
 * Command menu state management hook
 */
export function useCommandMenu(): UseCommandMenuReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchPluginResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
  }, [])

  const open = useCallback(() => {
    clearResetTimer()
    setIsOpen(true)
  }, [clearResetTimer])

  const close = useCallback(() => {
    clearResetTimer()
    setIsOpen(false)
    // Delay state reset, wait for close animation to complete
    resetTimerRef.current = setTimeout(() => {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
      setIsSearching(false)
      resetTimerRef.current = null
    }, 320)
  }, [clearResetTimer])

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const reset = useCallback(() => {
    clearResetTimer()
    setQuery('')
    setResults([])
    setSelectedIndex(0)
    setIsSearching(false)
  }, [clearResetTimer])

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

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
    selectedIndex,
    setSelectedIndex,
    reset
  }
}
