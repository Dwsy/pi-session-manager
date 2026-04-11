import { useEffect, useState, useRef, useCallback } from 'react'
import { useCommandMenu } from '@/hooks/useCommandMenu'
import type { SearchContext, SearchPluginResult } from '@/plugins/types'
import CommandMenu from './CommandMenu'
import type { MessageSearchPluginOptions } from '@/plugins/message/MessageSearchPlugin'
import type { FullTextSearchSourceFilter } from '@/types'

interface CommandPaletteProps {
  context: SearchContext
}

export default function CommandPalette({ context }: CommandPaletteProps) {
  const { isOpen, open, close, query, setQuery, results, setResults, isSearching, setIsSearching } = useCommandMenu()

  const [searchCurrentProjectOnly, setSearchCurrentProjectOnly] = useState(false)
  const [ftsOptions, setFtsOptions] = useState<MessageSearchPluginOptions>({
    ftsMode: true,
    roleFilter: 'all',
    sourceFilter: 'all' as FullTextSearchSourceFilter,
    globPattern: undefined,
    sortMode: 'newest',
    page: 0,
    pageSize: 20,
  })

  // Two-panel layout state: selected result for preview
  const [selectedResult, setSelectedResult] = useState<SearchPluginResult | null>(null)

  // Store registry reference from CommandMenu for keyboard shortcut handling
  const registryRef = useRef<any>(null)

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

  // Reset selection when results change
  useEffect(() => {
    setSelectedResult(null)
  }, [results])

  // Select first result when results arrive
  useEffect(() => {
    if (results.length > 0 && !selectedResult) {
      setSelectedResult(results[0])
    }
  }, [results, selectedResult])

  // Navigate to selected session
  const handleNavigate = useCallback(() => {
    if (!selectedResult || !registryRef.current) return
    const plugin = registryRef.current.get(selectedResult.pluginId)
    if (plugin) {
      plugin.onSelect(selectedResult, enhancedContext)
    }
  }, [selectedResult, enhancedContext])

  // Action keyboard shortcuts (only when palette is open)
  useEffect(() => {
    if (!isOpen) return
    const handleActionKeys = (e: KeyboardEvent) => {
      // Don't intercept if typing in search input or path input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' && target.getAttribute('type') !== 'search') return

      if (!selectedResult) return

      // Enter → navigate (when not in an input)
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        // Only handle if target is not a cmdk input
        const isCmdkInput = target.hasAttribute('cmdk-input') || target.closest('[cmdk-input-wrapper]')
        if (!isCmdkInput) {
          e.preventDefault()
          handleNavigate()
          return
        }
      }

      // Cmd+E → edit (placeholder for future)
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        // TODO: open session in edit mode
        return
      }

      // Cmd+D → delete (placeholder for future)
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault()
        // TODO: show delete confirmation
        return
      }
    }
    window.addEventListener('keydown', handleActionKeys)
    return () => window.removeEventListener('keydown', handleActionKeys)
  }, [isOpen, selectedResult, handleNavigate])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center px-4 pt-[3vh] sm:px-6 sm:pt-[5vh] bg-black/35 backdrop-blur-[6px] animate-in fade-in" onClick={close}>
      <div className="w-full max-w-[1380px] h-[92vh] sm:h-[90vh] bg-background/98 border border-border/80 rounded-[20px] shadow-[0_24px_80px_rgba(15,23,42,0.18)] overflow-hidden animate-in zoom-in-95 flex flex-col min-h-0" onClick={(e) => e.stopPropagation()}>
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
          selectedResult={selectedResult}
          setSelectedResult={setSelectedResult}
          registryRef={registryRef}
        />
      </div>
    </div>
  )
}
