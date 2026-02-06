import { useEffect } from 'react'

interface UseSessionHotkeysOptions {
  onToggleThinking: () => void
  onToggleTools: () => void
  onFocusSearch: () => void
}

export function useSessionHotkeys({
  onToggleThinking,
  onToggleTools,
  onFocusSearch,
}: UseSessionHotkeysOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 't') {
        event.preventDefault()
        event.stopPropagation()
        onToggleThinking()
      } else if ((event.metaKey || event.ctrlKey) && event.key === 'o') {
        event.preventDefault()
        event.stopPropagation()
        onToggleTools()
      } else if ((event.metaKey || event.ctrlKey) && event.key === 'f') {
        event.preventDefault()
        event.stopPropagation()
        onFocusSearch()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onToggleThinking, onToggleTools, onFocusSearch])
}
