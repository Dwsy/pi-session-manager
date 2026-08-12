import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useCommandMenu } from '@/hooks/useCommandMenu'
import type { SearchContext, SearchPluginResult } from '@/plugins/types'
import CommandMenu from './CommandMenu'
import type { MessageSearchPluginOptions } from '@/plugins/message/MessageSearchPlugin'
import type { FullTextSearchSourceFilter } from '@/types'
import type { CommandPaletteMode } from './commandActions'
import type { TabType } from './utils'
import type { PluginRegistry } from '@/plugins/registry'

interface CommandPaletteProps {
  context: SearchContext
}

const COMMAND_SEARCH_PAGE_SIZE = 20

export default function CommandPalette({ context }: CommandPaletteProps) {
  const { isOpen, open, close, query, setQuery, results, setResults, isSearching, setIsSearching } = useCommandMenu()
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [visible, setVisible] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enterFrameRef = useRef<number | null>(null)
  const enterFrame2Ref = useRef<number | null>(null)

  const [searchCurrentProjectOnly, setSearchCurrentProjectOnly] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [mode, setMode] = useState<CommandPaletteMode>('search')
  const [ftsOptions, setFtsOptions] = useState<MessageSearchPluginOptions>({
    ftsMode: true,
    roleFilter: 'all',
    sourceFilter: 'all' as FullTextSearchSourceFilter,
    globPattern: undefined,
    sortMode: 'newest',
    page: 0,
    pageSize: COMMAND_SEARCH_PAGE_SIZE,
  })

  // Two-panel layout state: selected result for preview
  const [selectedResult, setSelectedResult] = useState<SearchPluginResult | null>(null)

  // Store registry reference from CommandMenu for keyboard shortcut handling
  const registryRef = useRef<PluginRegistry | null>(null)

  const enhancedContext = useMemo<SearchContext>(() => ({
    ...context,
    closeCommandMenu: close,
    searchCurrentProjectOnly,
  }), [context, close, searchCurrentProjectOnly])

  useEffect(() => {
    if (enterFrameRef.current !== null) {
      cancelAnimationFrame(enterFrameRef.current)
      enterFrameRef.current = null
    }
    if (enterFrame2Ref.current !== null) {
      cancelAnimationFrame(enterFrame2Ref.current)
      enterFrame2Ref.current = null
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }

    if (isOpen) {
      setShouldRender(true)
      enterFrameRef.current = requestAnimationFrame(() => {
        enterFrame2Ref.current = requestAnimationFrame(() => {
          setVisible(true)
          enterFrame2Ref.current = null
        })
        enterFrameRef.current = null
      })
      return
    }

    setVisible(false)
    closeTimerRef.current = setTimeout(() => {
      setShouldRender(false)
      closeTimerRef.current = null
    }, 320)

    return () => {
      if (enterFrameRef.current !== null) {
        cancelAnimationFrame(enterFrameRef.current)
        enterFrameRef.current = null
      }
      if (enterFrame2Ref.current !== null) {
        cancelAnimationFrame(enterFrame2Ref.current)
        enterFrame2Ref.current = null
      }
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && key === 'p') {
        e.preventDefault()
        e.stopPropagation()
        isOpen ? close() : open()
      }
      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault()
        e.stopPropagation()
        isOpen ? close() : open()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === 'f') {
        e.preventDefault()
        e.stopPropagation()
        isOpen ? close() : open()
      }
      if (e.key === 'F1') {
        e.preventDefault()
        e.stopPropagation()
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
      // Delay to ensure DOM is ready and avoid race conditions
      const frameId = requestAnimationFrame(() => {
        const input = document.querySelector('[cmdk-input]') as HTMLInputElement
        if (input && document.contains(input)) {
          input.focus()
        }
      })
      return () => cancelAnimationFrame(frameId)
    }
  }, [isOpen])

  // Preserve the current preview when pagination appends results.
  useEffect(() => {
    setSelectedResult((current) => {
      if (results.length === 0) return null
      if (current) {
        const retained = results.find(
          (result) => result.id === current.id && result.pluginId === current.pluginId,
        )
        if (retained) return retained
      }
      return results[0]
    })
  }, [results])

  // Navigate to selected session
  const handleNavigate = useCallback(() => {
    if (!selectedResult || !registryRef.current) return
    const plugin = registryRef.current.get(selectedResult.pluginId)
    if (plugin) {
      plugin.onSelect(selectedResult, enhancedContext)
      close()
    }
  }, [selectedResult, enhancedContext, close])

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
        }
      }
    }
    window.addEventListener('keydown', handleActionKeys)
    return () => window.removeEventListener('keydown', handleActionKeys)
  }, [isOpen, selectedResult, handleNavigate])

  if (!shouldRender) return null

  return (
    <div
      className={`fixed inset-0 z-[9998] flex items-start justify-center px-4 pt-[3vh] sm:px-6 sm:pt-[5vh] bg-black/35 backdrop-blur-[6px] motion-overlay-backdrop ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={close}
    >
      <div
        className={`w-full max-w-4xl h-[80vh] sm:h-[70vh] bg-background/98 border border-border/80 rounded-xl shadow-[0_24px_80px_rgba(15,23,42,0.18)] overflow-hidden motion-overlay-surface flex flex-col min-h-0 ${visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.985] opacity-0'}`}
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
          ftsOptions={ftsOptions}
          setFtsOptions={setFtsOptions}
          selectedResult={selectedResult}
          setSelectedResult={setSelectedResult}
          registryRef={registryRef}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          mode={mode}
          setMode={setMode}
        />
      </div>
    </div>
  )
}
