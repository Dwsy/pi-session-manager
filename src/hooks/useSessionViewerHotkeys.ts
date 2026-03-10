import { useEffect } from 'react'

export interface UseSessionViewerHotkeysOptions {
  enabled?: boolean
  isSearchOpen: boolean
  onToggleThinking: () => void
  onToggleToolsExpanded: () => void
  onOpenSearch: () => void
  onCloseSearch: () => void
  onNextSearchMatch: () => void
  onPreviousSearchMatch: () => void
}

export function useSessionViewerHotkeys({
  enabled = true,
  isSearchOpen,
  onToggleThinking,
  onToggleToolsExpanded,
  onOpenSearch,
  onCloseSearch,
  onNextSearchMatch,
  onPreviousSearchMatch,
}: UseSessionViewerHotkeysOptions): void {
  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return
      }

      const key = event.key.toLowerCase()

      if ((event.metaKey || event.ctrlKey) && key === 'f') {
        event.preventDefault()
        event.stopPropagation()
        onOpenSearch()
        return
      }

      if (isSearchOpen && (event.metaKey || event.ctrlKey) && key === 'g') {
        event.preventDefault()
        event.stopPropagation()
        if (event.shiftKey) {
          onPreviousSearchMatch()
        } else {
          onNextSearchMatch()
        }
        return
      }

      if (isSearchOpen && event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseSearch()
        return
      }

      if (!(event.metaKey || event.ctrlKey)) {
        return
      }

      if (key === 't') {
        event.preventDefault()
        event.stopPropagation()
        onToggleThinking()
        return
      }

      if (key === 'o') {
        event.preventDefault()
        event.stopPropagation()
        onToggleToolsExpanded()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [
    enabled,
    isSearchOpen,
    onCloseSearch,
    onNextSearchMatch,
    onOpenSearch,
    onPreviousSearchMatch,
    onToggleThinking,
    onToggleToolsExpanded,
  ])
}
