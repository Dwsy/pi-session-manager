import { useEffect } from 'react'

export interface UseSessionViewerHotkeysOptions {
  enabled?: boolean
  isSearchOpen: boolean
  cmdFBehavior: 'inSessionSearch' | 'toggleSidebar'
  previewMode?: boolean
  onToggleThinking: () => void
  onToggleToolsExpanded: () => void
  onToggleSidebar: () => void
  onOpenSearch: () => void
  onCloseSearch: () => void
  onNextSearchMatch: () => void
  onPreviousSearchMatch: () => void
  onCopyResumeCommand?: () => void
  onResume?: () => void
}

export function useSessionViewerHotkeys({
  enabled = true,
  isSearchOpen,
  cmdFBehavior = 'inSessionSearch',
  previewMode = false,
  onToggleThinking,
  onToggleToolsExpanded,
  onToggleSidebar,
  onOpenSearch,
  onCloseSearch,
  onNextSearchMatch,
  onPreviousSearchMatch,
  onCopyResumeCommand,
  onResume,
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
          onToggleSidebar()
        } else {
          onOpenSearch()
        }
        return
      }

      // Cmd+F behavior depends on cmdFBehavior setting
      if ((event.metaKey || event.ctrlKey) && key === 'f') {
        event.preventDefault()
        event.stopPropagation()
        if (cmdFBehavior === 'inSessionSearch') {
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

      // Search navigation (only when search is open)
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

      // Escape closes search
      if (isSearchOpen && event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseSearch()
        return
      }

      // Modifier key required for rest
      if (!(event.metaKey || event.ctrlKey)) {
        return
      }

      // Cmd+T / Cmd+O: disabled in preview mode
      if (!previewMode) {
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
      }

      // Cmd+Shift+C: Copy resume command (allowed in preview)
      if (event.shiftKey && key === 'c') {
        if (onCopyResumeCommand) {
          event.preventDefault()
          event.stopPropagation()
          onCopyResumeCommand()
        }
        return
      }

      // Cmd+R: Resume (allowed in preview)
      if (key === 'r' && onResume) {
        event.preventDefault()
        event.stopPropagation()
        onResume()
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
    cmdFBehavior,
    previewMode,
    onCloseSearch,
    onCopyResumeCommand,
    onNextSearchMatch,
    onOpenSearch,
    onPreviousSearchMatch,
    onToggleThinking,
    onToggleToolsExpanded,
    onToggleSidebar,
    onResume,
  ])
}
