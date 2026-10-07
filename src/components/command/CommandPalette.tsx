import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useCommandMenu, PALETTE_ANIMATION_MS } from '@/hooks/useCommandMenu'
import { useTranslation } from 'react-i18next'
import type { SearchContext, SearchPluginResult } from '@/plugins/types'
import CommandMenu from './CommandMenu'
import type { MessageSearchPluginOptions } from '@/plugins/message/MessageSearchPlugin'
import type { FullTextSearchSourceFilter } from '@/types'
import type { CommandPaletteMode } from './commandActions'
import type { TabType } from './utils'

interface CommandPaletteProps {
  context: SearchContext
}

const COMMAND_SEARCH_PAGE_SIZE = 20

export default function CommandPalette({ context }: CommandPaletteProps) {
  const { t } = useTranslation()
  const { isOpen, open, close, query, setQuery, results, setResults, isSearching, setIsSearching } = useCommandMenu()
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [visible, setVisible] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const enterFrameRef = useRef<number | null>(null)
  const enterFrame2Ref = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

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
    }, PALETTE_ANIMATION_MS)

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

  // Toggle bindings. Cmd+P deliberately matches with or without Shift (editor
  // convention); Cmd+K and F1 are additional aliases. Escape closes when open.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && (key === 'p' || key === 'k')) {
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

  // Focus the input on every open (RAF so the freshly mounted tree is queried),
  // and restore focus to wherever the user was before opening.
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null
      const frameId = requestAnimationFrame(() => {
        const input = document.querySelector('[data-cmdk-input]') as HTMLInputElement | null
        if (input && document.contains(input)) {
          input.focus()
        }
      })
      return () => cancelAnimationFrame(frameId)
    }

    const previous = previouslyFocusedRef.current
    previouslyFocusedRef.current = null
    if (previous && document.contains(previous)) {
      previous.focus()
    }
  }, [isOpen])

  // Align with the query reset on close: reopening starts in search mode.
  useEffect(() => {
    if (isOpen) setMode('search')
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

  // Keep Tab cycling inside the palette dialog. The search input skips this:
  // its own Tab handler cycles palette modes.
  const handlePanelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const target = e.target as HTMLElement | null
    if (target?.hasAttribute('data-cmdk-input')) return
    const container = panelRef.current
    if (!container) return
    const focusables = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const containsTarget = target ? container.contains(target) : false
    if (e.shiftKey && (target === first || !containsTarget)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (target === last || !containsTarget)) {
      e.preventDefault()
      first.focus()
    }
  }, [])

  if (!shouldRender) return null

  return (
    <div
      className={`fixed inset-0 z-[9998] flex items-start justify-center px-4 pt-[3vh] sm:px-6 sm:pt-[5vh] bg-black/35 backdrop-blur-[6px] motion-overlay-backdrop ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={close}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('command.paletteLabel', 'Command palette')}
        className={`w-full max-w-[1380px] h-[80vh] bg-background/98 border border-border/80 rounded-xl shadow-[0_24px_80px_rgba(15,23,42,0.18)] overflow-hidden motion-overlay-surface flex flex-col min-h-0 ${visible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-2 scale-[0.985] opacity-0'}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handlePanelKeyDown}
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
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          mode={mode}
          setMode={setMode}
        />
      </div>
    </div>
  )
}
