import { useEffect, useState } from 'react'
import { useCommandMenu } from '../../hooks/useCommandMenu'
import type { SearchContext } from '../../plugins/types'
import CommandMenu from './CommandMenu'

interface CommandPaletteProps {
  context: SearchContext
}

export default function CommandPalette({ context }: CommandPaletteProps) {
  const {
    isOpen,
    open,
    close,
    query,
    setQuery,
    results,
    setResults,
    isSearching,
    setIsSearching
  } = useCommandMenu()
  
  const [searchCurrentProjectOnly, setSearchCurrentProjectOnly] = useState(false)
  
  // Create enhanced context including search-scope state
  const enhancedContext: SearchContext = {
    ...context,
    closeCommandMenu: close,
    searchCurrentProjectOnly
  }
  
  // Global shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux) - Toggle panel
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        isOpen ? close() : open()
      }
      
      // ESC closes the palette
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        close()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, close, isOpen])
  
  // Auto-focus when opened
  useEffect(() => {
    if (isOpen) {
      // Delay focus until DOM is rendered
      setTimeout(() => {
        const input = document.querySelector('[cmdk-input]') as HTMLInputElement
        if (input) {
          input.focus()
        }
      }, 100)
    }
  }, [isOpen])
  
  if (!isOpen) return null
  
  return (
    <div
      className="fixed inset-0 z-[9998] flex items-start justify-center px-3 pt-[6vh] sm:px-6 sm:pt-[9vh] bg-black/50 backdrop-blur-sm animate-in fade-in"
      onClick={close}
    >
      <div
        className="w-full max-w-5xl max-h-[84vh] sm:max-h-[82vh] bg-background/95 border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <CommandMenu
          query={query}
          setQuery={setQuery}
          results={results}
          setResults={setResults}
          isSearching={isSearching}
          setIsSearching={setIsSearching}
          context={enhancedContext}
          onClose={close}
          searchCurrentProjectOnly={searchCurrentProjectOnly}
          setSearchCurrentProjectOnly={setSearchCurrentProjectOnly}
        />
      </div>
    </div>
  )
}
