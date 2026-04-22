import { useEffect } from 'react'

export interface UseSessionViewerHotkeysOptions {
  enabled?: boolean
  isSearchOpen: boolean
  isCopyFocused: boolean
  cmdFBehavior: 'inSessionSearch' | 'toggleSidebar'
  onToggleThinking: () => void
  onToggleToolsExpanded: () => void
  onToggleSidebar: () => void
  onOpenSearch: () => void
  onCloseSearch: () => void
  onNextSearchMatch: () => void
  onPreviousSearchMatch: () => void
  onCopyResumeCommand?: () => void
}

export function useSessionViewerHotkeys({
  enabled = true,
  isSearchOpen,
  isCopyFocused,
  cmdFBehavior = 'inSessionSearch',
  onToggleThinking,
  onToggleToolsExpanded,
  onToggleSidebar,
  onOpenSearch,
  onCloseSearch,
  onNextSearchMatch,
  onPreviousSearchMatch,
  onCopyResumeCommand,
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

      // Cmd+Shift+F behavior depends on cmdFBehavior setting
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === 'f') {
        event.preventDefault()
        event.stopPropagation()
        if (cmdFBehavior === 'inSessionSearch') {
          // Cmd+Shift+F toggles sidebar when Cmd+F is in-session search
          onToggleSidebar()
        } else {
          // Cmd+Shift+F opens in-session search when Cmd+F toggles sidebar
          onOpenSearch()
        }
        return
      }

      // Cmd+F behavior depends on cmdFBehavior setting
      if ((event.metaKey || event.ctrlKey) && key === 'f') {
        event.preventDefault()
        event.stopPropagation()
        if (cmdFBehavior === 'inSessionSearch') {
          // Toggle: close if open, open if closed
          if (isSearchOpen) {
            onCloseSearch()
          } else {
            onOpenSearch()
          }
        } else {
          onToggleSidebar()
        }
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
        return
      }

      // Cmd+Shift+C: Copy resume command
      // Don't trigger when the invisible textarea is focused (user is trying to paste)
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === 'c') {
        if (onCopyResumeCommand && !isCopyFocused) {
          event.preventDefault()
          event.stopPropagation()
          onCopyResumeCommand()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [
    enabled,
    isSearchOpen,
    isCopyFocused,
    cmdFBehavior,
    onCloseSearch,
    onCopyResumeCommand,
    onNextSearchMatch,
    onOpenSearch,
    onPreviousSearchMatch,
    onToggleThinking,
    onToggleToolsExpanded,
    onToggleSidebar,
  ])
}
