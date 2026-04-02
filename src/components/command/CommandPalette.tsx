import { useEffect, useState } from 'react'
import { useCommandMenu } from '../../hooks/useCommandMenu'
import type { SearchContext } from '../../plugins/types'
import CommandMenu from './CommandMenu'
import type { MessageSearchPluginOptions } from '../../plugins/message/MessageSearchPlugin'

interface CommandPaletteProps {
  context: SearchContext
}

export default function CommandPalette({ context }: CommandPaletteProps) {
  const { isOpen, open, close, query, setQuery, results, setResults, isSearching, setIsSearching } = useCommandMenu()

  const [searchCurrentProjectOnly, setSearchCurrentProjectOnly] = useState(false)
  const [ftsOptions, setFtsOptions] = useState<MessageSearchPluginOptions>({
    ftsMode: true,
    roleFilter: 'all',
    globPattern: undefined,
    sortMode: 'newest',
    page: 0,
    pageSize: 20,
  })

  const enhancedContext: SearchContext = { ...context, closeCommandMenu: close, searchCurrentProjectOnly }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        isOpen ? close() : open()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        isOpen ? close() : open()
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, close, isOpen])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        const input = document.querySelector('[cmdk-input]') as HTMLInputElement
        if (input) input.focus()
      }, 100)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center px-3 pt-[6vh] sm:px-6 sm:pt-[9vh] bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={close}>
      <div className="w-full max-w-5xl max-h-[84vh] sm:max-h-[82vh] bg-background/95 border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95" onClick={(e) => e.stopPropagation()}>
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
          ftsOptions={ftsOptions}
          setFtsOptions={setFtsOptions}
        />
      </div>
    </div>
  )
}
