import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useRef, useState, useCallback, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Search,
  Loader2,
  FolderOpen,
  MessageSquare,
  FileText,
  Tag,
  SlidersHorizontal,
  Globe,
  User,
  Bot,
  ArrowUpDown,
  Star,
  ArrowUpRight,
} from 'lucide-react'
import type { SearchPluginResult, SearchContext } from '@/plugins/types'
import { useSearchPlugins } from '@/hooks/useSearchPlugins'
import CommandEmpty from './CommandEmpty'
import CommandLoading from './CommandLoading'
import CommandHints from './CommandHints'
import CommandError from './CommandError'
import SessionPreviewPanel from './SessionPreviewPanel'
import { getPathBasename } from '@/utils/path'
import {
  formatSourceFilterToken,
  parseLeadingSourceFilterToken,
} from '@/utils/search'
import type { MessageSearchPluginOptions } from '@/plugins/message/MessageSearchPlugin'
import type { FullTextSearchSourceFilter } from '@/types'

interface CommandMenuProps {
  query: string
  setQuery: (query: string) => void
  results: SearchPluginResult[]
  setResults: (results: SearchPluginResult[]) => void
  isSearching: boolean
  setIsSearching: (isSearching: boolean) => void
  context: SearchContext
  onClose: () => void
  searchCurrentProjectOnly: boolean
  setSearchCurrentProjectOnly: (value: boolean) => void
  ftsOptions: MessageSearchPluginOptions
  setFtsOptions: (options: MessageSearchPluginOptions) => void
  selectedResult: SearchPluginResult | null
  setSelectedResult: (result: SearchPluginResult | null) => void
  registryRef: React.MutableRefObject<any>
}

type TabType = 'all' | 'message' | 'session' | 'project'

const TABS: { id: TabType; key: string; pluginId?: string; Icon: typeof Search }[] = [
  { id: 'all', key: 'tabs.all', Icon: Search },
  { id: 'message', key: 'tabs.message', pluginId: 'message-search', Icon: MessageSquare },
  { id: 'session', key: 'tabs.session', pluginId: 'session-search', Icon: FileText },
  { id: 'project', key: 'tabs.project', pluginId: 'project-search', Icon: FolderOpen },
]

const SOURCE_FILTERS: FullTextSearchSourceFilter[] = ['all', 'labels_only', 'content_only']

function formatResultTime(result: SearchPluginResult): string | null {
  const meta = result.metadata as any
  const raw = meta?.timestamp || meta?.session?.modified || meta?.session?.created
  if (!raw) return null

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null

  const now = new Date()
  const sameDay = now.toDateString() === date.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function getResultSnippet(result: SearchPluginResult): string[] {
  const meta = result.metadata as any

  if (Array.isArray(meta?.snippetLines) && meta.snippetLines.length > 0) {
    return meta.snippetLines.slice(0, 3)
  }

  if (result.description) {
    return [result.description]
  }

  return []
}

function getResultMetaLine(result: SearchPluginResult): string {
  if (result.subtitle) return result.subtitle
  const meta = result.metadata as any
  return meta?.sessionPath || ''
}

function getRoleBadge(result: SearchPluginResult): { label: string; className: string } | null {
  if (result.pluginId !== 'message-search') return null
  const role = (result.metadata as any)?.role

  if (role === 'assistant') {
    return {
      label: 'AI',
      className: 'bg-sky-500/8 text-sky-600 border-sky-500/15',
    }
  }

  if (role === 'user') {
    return {
      label: 'User',
      className: 'bg-background text-foreground/70 border-border/80',
    }
  }

  return null
}

function getTabLabel(t: any, tab: { key: string }) {
  return t(`command.${tab.key}`)
}

function getRoleFilterLabel(value: 'all' | 'user' | 'assistant') {
  if (value === 'all') return 'All'
  if (value === 'user') return 'User'
  return 'AI'
}

function getSourceFilterLabel(t: any, value: FullTextSearchSourceFilter) {
  if (value === 'labels_only') return t('search.fullText.source.labels', 'Labels')
  if (value === 'content_only') return t('search.fullText.source.content', 'Content')
  return t('search.fullText.source.all', 'All')
}

function getSortLabel(value: 'newest' | 'oldest' | 'score') {
  if (value === 'newest') return 'Newest'
  if (value === 'oldest') return 'Oldest'
  return 'Score'
}

export default function CommandMenu({
  query,
  setQuery,
  results,
  setResults,
  isSearching,
  setIsSearching,
  context,
  onClose,
  searchCurrentProjectOnly,
  setSearchCurrentProjectOnly,
  ftsOptions,
  setFtsOptions,
  selectedResult,
  setSelectedResult,
  registryRef,
}: CommandMenuProps) {
  const { t } = useTranslation()
  const { registry, search } = useSearchPlugins(context)
  const debounceRef = useRef<NodeJS.Timeout>()
  const abortControllerRef = useRef<AbortController>()
  const requestIdRef = useRef(0)
  const [searchError, setSearchError] = useState<string | undefined>()
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [showFilters, setShowFilters] = useState(true)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const ftsOptionsRef = useRef(ftsOptions)
  const resultsRef = useRef(results)
  ftsOptionsRef.current = ftsOptions
  resultsRef.current = results

  useEffect(() => {
    registryRef.current = registry
  }, [registry, registryRef])

  const currentProjectName = context.selectedProject
    ? getPathBasename(context.selectedProject)
    : null
  const parsedSourceToken = useMemo(() => parseLeadingSourceFilterToken(query), [query])
  const supportsMessageFilters = activeTab === 'all' || activeTab === 'message'
  const normalizedQuery = supportsMessageFilters && parsedSourceToken.sourceFilter
    ? parsedSourceToken.normalizedQuery
    : query
  const effectiveSourceFilter = supportsMessageFilters
    ? (parsedSourceToken.sourceFilter || ftsOptions.sourceFilter || 'all')
    : 'all'
  const isLabelsBrowseMode = supportsMessageFilters && effectiveSourceFilter === 'labels_only' && !normalizedQuery.trim()
  const effectiveSortMode = isLabelsBrowseMode && ftsOptions.sortMode === 'score'
    ? 'newest'
    : (ftsOptions.sortMode || 'newest')
  const sourceFilterSuggestions = useMemo(() => {
    if (!supportsMessageFilters || !query.startsWith('#') || /\s/.test(query)) {
      return []
    }

    const prefix = query.toLowerCase()
    return SOURCE_FILTERS.filter(value => formatSourceFilterToken(value).startsWith(prefix) && formatSourceFilterToken(value) !== prefix)
  }, [query, supportsMessageFilters])

  const scopedPluginIds = useMemo(() => {
    if (activeTab === 'all' && effectiveSourceFilter !== 'all') {
      return ['message-search']
    }

    const currentTab = TABS.find(tab => tab.id === activeTab)
    return currentTab?.pluginId ? [currentTab.pluginId] : undefined
  }, [activeTab, effectiveSourceFilter])

  useEffect(() => {
    requestIdRef.current += 1
    const currentRequestId = requestIdRef.current

    if (abortControllerRef.current) abortControllerRef.current.abort()
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!normalizedQuery.trim() && !isLabelsBrowseMode) {
      setResults([])
      setIsSearching(false)
      setSearchError(undefined)
      return
    }

    const isLoadMore = (ftsOptionsRef.current.page || 0) > 0
    if (!isLoadMore) {
      setIsSearching(true)
      setSearchError(undefined)
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Search timeout after 15 seconds')), 15000)
        })

        const messagePlugin = registry.get('message-search')
        if (messagePlugin && 'setFTSOptions' in messagePlugin) {
          ;(messagePlugin as any).setFTSOptions({
            ftsMode: true,
            roleFilter: ftsOptions.roleFilter,
            sourceFilter: effectiveSourceFilter,
            globPattern: ftsOptions.globPattern,
            sortMode: effectiveSortMode,
            page: ftsOptions.page || 0,
            pageSize: ftsOptions.pageSize || 20,
          })
        }

        const parts: string[] = [activeTab]
        if (ftsOptions.roleFilter !== 'all') parts.push(ftsOptions.roleFilter!)
        if (effectiveSourceFilter !== 'all') parts.push(effectiveSourceFilter)
        if (effectiveSortMode !== 'newest') parts.push(effectiveSortMode)
        if (ftsOptions.page) parts.push(String(ftsOptions.page))

        const searchPromise = isLabelsBrowseMode && messagePlugin
          ? messagePlugin.search('', context)
          : search(normalizedQuery, { pluginIds: scopedPluginIds, cacheKeyParts: parts })
        const pageResults = await Promise.race([searchPromise, timeoutPromise])
        if (controller.signal.aborted || currentRequestId !== requestIdRef.current) return

        const currentPage = ftsOptionsRef.current.page || 0
        if (currentPage > 0) {
          setResults([...resultsRef.current, ...pageResults])
        } else {
          setResults(pageResults)
        }
        setIsSearching(false)
      } catch (error) {
        if (controller.signal.aborted || currentRequestId !== requestIdRef.current) return
        console.error('[CommandMenu] Search error:', error)
        if (error instanceof Error && error.name !== 'AbortError') {
          setSearchError(error.message)
          setResults([])
        }
        setIsSearching(false)
      }
    }, 220)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [
    normalizedQuery,
    isLabelsBrowseMode,
    effectiveSourceFilter,
    effectiveSortMode,
    search,
    setIsSearching,
    setResults,
    context.selectedProject,
    context.searchCurrentProjectOnly,
    context.sessions,
    activeTab,
    scopedPluginIds,
    registry,
    ftsOptions.roleFilter,
    ftsOptions.page,
    ftsOptions.globPattern,
  ])

  const loadMore = useCallback(() => {
    setFtsOptions({ ...ftsOptionsRef.current, page: (ftsOptionsRef.current.page || 0) + 1 })
  }, [setFtsOptions])

  useEffect(() => {
    const wrapper = document.getElementById('search-results-wrapper')
    if (!wrapper) return
    const handleScroll = () => {
      if (isSearching) return
      if (wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 150) {
        loadMore()
      }
    }
    wrapper.addEventListener('scroll', handleScroll, { passive: true })
    return () => wrapper.removeEventListener('scroll', handleScroll)
  }, [isSearching, loadMore])

  const groupedResults = useMemo(() => {
    return results.reduce((acc: Record<string, SearchPluginResult[]>, r) => {
      if (!acc[r.pluginId]) acc[r.pluginId] = []
      acc[r.pluginId].push(r)
      return acc
    }, {} as Record<string, SearchPluginResult[]>)
  }, [results])

  const tabCounts = useMemo(() => {
    return TABS.reduce((acc: Record<TabType, number>, tab) => {
      acc[tab.id] = tab.pluginId ? groupedResults[tab.pluginId]?.length || 0 : results.length
      return acc
    }, {} as Record<TabType, number>)
  }, [groupedResults, results.length])

  const selectedPlugin = selectedResult ? registry.get(selectedResult.pluginId) : null

  const handleSelect = useCallback(() => {
    if (!selectedResult || !selectedPlugin) return
    selectedPlugin.onSelect(selectedResult, context)
    onClose()
  }, [selectedResult, selectedPlugin, context, onClose])

  const showAdvancedMessageFilters = showFilters && supportsMessageFilters
  const inputPlaceholder = effectiveSourceFilter === 'labels_only'
    ? t('search.fullText.labelsPlaceholder', 'Browse all labels...')
    : t('command.placeholder', 'Search sessions, projects, messages...')

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    if (!supportsMessageFilters) {
      return
    }

    const parsed = parseLeadingSourceFilterToken(value)
    setFtsOptions({
      ...ftsOptionsRef.current,
      sourceFilter: parsed.sourceFilter || ftsOptionsRef.current.sourceFilter || 'all',
      page: 0,
    })
  }, [setFtsOptions, setQuery, supportsMessageFilters])

  const handleSourceFilterChange = useCallback((nextSourceFilter: FullTextSearchSourceFilter) => {
    setFtsOptions({ ...ftsOptionsRef.current, sourceFilter: nextSourceFilter, page: 0 })
    const parsed = parseLeadingSourceFilterToken(query)
    setQuery(parsed.sourceFilter ? parsed.normalizedQuery : query)
  }, [query, setFtsOptions, setQuery])

  const applySuggestedSourceFilter = useCallback((nextSourceFilter: FullTextSearchSourceFilter) => {
    setFtsOptions({ ...ftsOptionsRef.current, sourceFilter: nextSourceFilter, page: 0 })
    setQuery(`${formatSourceFilterToken(nextSourceFilter)} `)
  }, [setFtsOptions, setQuery])

  const handleInputKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (sourceFilterSuggestions.length > 0 && (event.key === 'Tab' || event.key === 'Enter')) {
      event.preventDefault()
      applySuggestedSourceFilter(sourceFilterSuggestions[0])
    }
  }, [applySuggestedSourceFilter, sourceFilterSuggestions])

  return (
    <div className="w-full h-full min-h-0 flex flex-col overflow-hidden bg-background">
      <div className="px-5 pt-5 pb-4 border-b border-border/80 bg-background/95 flex-shrink-0">
        <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-background px-4 py-3 shadow-sm">
          <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={inputPlaceholder}
              className="w-full bg-transparent border-0 outline-none text-[15px] font-medium text-foreground placeholder:text-muted-foreground/70"
              autoFocus
            />
            {sourceFilterSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border/80 bg-background shadow-xl">
                {sourceFilterSuggestions.map(value => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => applySuggestedSourceFilter(value)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-surface"
                  >
                    <span className="font-mono text-[12px] text-blue-600">
                      {formatSourceFilterToken(value)}
                    </span>
                    <span className="text-muted-foreground">
                      {getSourceFilterLabel(t, value)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {isSearching && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { if (currentProjectName) setSearchCurrentProjectOnly(!searchCurrentProjectOnly) }}
              disabled={!currentProjectName}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                !currentProjectName
                  ? 'border-border/50 text-muted-foreground/40 cursor-not-allowed'
                  : searchCurrentProjectOnly
                    ? 'border-blue-500/30 bg-blue-500/8 text-blue-600'
                    : 'border-border/70 text-muted-foreground hover:text-foreground hover:bg-surface'
              }`}
              title={currentProjectName ? t('command.currentProjectOnly', 'Current project only') : t('command.noProject', 'No active project')}
            >
              <FolderOpen className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                showFilters
                  ? 'border-blue-500/30 bg-blue-500/8 text-blue-600'
                  : 'border-border/70 text-muted-foreground hover:text-foreground hover:bg-surface'
              }`}
              title={t('command.filters', 'Filters')}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <kbd className="inline-flex h-9 items-center rounded-lg border border-border/70 bg-surface px-2.5 text-[10px] text-muted-foreground font-mono">ESC</kbd>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map(tab => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                    isActive
                      ? 'border-foreground/10 bg-foreground/[0.06] text-foreground font-medium'
                      : 'border-border/70 bg-background text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  <tab.Icon className="w-3.5 h-3.5" />
                  <span>{getTabLabel(t, tab)}</span>
                  {tabCounts[tab.id] > 0 && (
                    <span className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                      isActive
                        ? 'bg-foreground text-background'
                        : 'bg-surface text-muted-foreground'
                    }`}>
                      {tabCounts[tab.id]}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {showAdvancedMessageFilters && (
            <>
              <div className="h-5 w-px bg-border/70" />
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background p-1">
                  {(['all', 'user', 'assistant'] as const).map(value => (
                    <button
                      key={value}
                      onClick={() => setFtsOptions({ ...ftsOptions, roleFilter: value, page: 0 })}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                        ftsOptions.roleFilter === value
                          ? 'bg-foreground/[0.06] text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {value === 'all' && <><User className="w-3 h-3" /><Bot className="w-3 h-3" /></>}
                      {value === 'user' && <User className="w-3 h-3" />}
                      {value === 'assistant' && <Bot className="w-3 h-3" />}
                      <span>{getRoleFilterLabel(value)}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background p-1">
                  {SOURCE_FILTERS.map(value => (
                    <button
                      key={value}
                      onClick={() => handleSourceFilterChange(value)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                        effectiveSourceFilter === value
                          ? 'bg-foreground/[0.06] text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {value === 'labels_only' && <Tag className="w-3 h-3" />}
                      {value === 'content_only' && <FileText className="w-3 h-3" />}
                      {value === 'all' && <Search className="w-3 h-3" />}
                      <span>{getSourceFilterLabel(t, value)}</span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background p-1">
                  {(['newest', 'oldest', 'score'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setFtsOptions({ ...ftsOptions, sortMode: mode, page: 0 })}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                        effectiveSortMode === mode
                          ? 'bg-foreground/[0.06] text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {mode === 'newest' && <ArrowUpDown className="w-3 h-3 rotate-180" />}
                      {mode === 'oldest' && <ArrowUpDown className="w-3 h-3" />}
                      {mode === 'score' && <Star className="w-3 h-3" />}
                      <span>{getSortLabel(mode)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {showFilters && (
            <div className="ml-auto flex min-w-[190px] items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2">
              <Globe className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
              <input
                type="text"
                value={ftsOptions.globPattern || ''}
                onChange={e => setFtsOptions({ ...ftsOptions, globPattern: e.target.value || undefined, page: 0 })}
                placeholder="path..."
                className="w-full bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/55 outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {(!!normalizedQuery.trim() || isLabelsBrowseMode) && !isSearching && !searchError && (
        <div className="px-5 py-2 border-b border-border/60 text-[11px] text-muted-foreground flex items-center justify-between gap-3 flex-shrink-0 bg-surface/20">
          <span className="font-medium">{t('command.summary.results', { count: results.length, defaultValue: `${results.length} results` })}</span>
          {activeTab !== 'all' && (
            <span className="uppercase tracking-[0.08em] text-[10px] text-muted-foreground/80">
              {t(`command.${TABS.find(tab => tab.id === activeTab)?.key}`)}
            </span>
          )}
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="w-[400px] flex-shrink-0 border-r border-border/70 flex flex-col h-full overflow-hidden bg-surface/[0.22]">
          <div id="search-results-wrapper" className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
            {isSearching && <CommandLoading />}
            {!isSearching && searchError && <CommandError error={searchError} />}
            {!isSearching && !searchError && results.length === 0 && (normalizedQuery.trim() || isLabelsBrowseMode) && (
              isLabelsBrowseMode ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Tag className="mb-3 h-12 w-12 text-amber-500/50" />
                  <p className="text-sm text-muted-foreground">
                    {t('search.fullText.noLabels', 'No labels found')}
                  </p>
                </div>
              ) : (
                <CommandEmpty query={normalizedQuery} />
              )
            )}
            {!isSearching && !searchError && !normalizedQuery.trim() && !isLabelsBrowseMode && <CommandHints />}
            {!isSearching && !searchError && Object.entries(groupedResults).map(([pluginId, pluginResults]) => {
              if (activeTab !== 'all' && activeTab !== TABS.find(tab => tab.pluginId === pluginId)?.id) return null
              const plugin = registry.get(pluginId)
              if (!plugin) return null

              return (
                <section key={pluginId} className="mb-5 last:mb-0">
                  {activeTab === 'all' && (
                    <div className="px-2 pb-2 text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-[0.14em]">
                      {plugin.name}
                    </div>
                  )}
                  <div className="space-y-2">
                    {pluginResults.map(result => {
                      const isSelected = selectedResult?.id === result.id
                      const roleBadge = getRoleBadge(result)
                      const snippetLines = getResultSnippet(result)
                      const metaLine = getResultMetaLine(result)
                      const timeLabel = formatResultTime(result)
                      const isMessageResult = result.pluginId === 'message-search'
                      const isLabelMatch = (result.metadata as any)?.matchReason === 'label'

                      return (
                        <div
                          key={result.id}
                          onClick={() => setSelectedResult(result)}
                          tabIndex={0}
                          role="option"
                          aria-selected={isSelected}
                          className={`group relative cursor-pointer rounded-2xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-0 ${
                            isSelected
                              ? 'border-foreground/12 bg-background shadow-sm'
                              : 'border-transparent bg-transparent hover:border-border/70 hover:bg-background/78'
                          }`}
                        >
                          <div className="px-4 py-3.5">
                            <div className="flex items-start gap-3">
                              {result.icon && (
                                <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border flex-shrink-0 ${
                                  isSelected
                                    ? 'border-foreground/10 bg-foreground/[0.05] text-foreground'
                                    : 'border-border/60 bg-background text-muted-foreground'
                                }`}>
                                  {result.icon}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                {isMessageResult && snippetLines.length > 0 ? (
                                  <>
                                    <div className={`rounded-xl border px-3 py-2.5 ${
                                      isSelected
                                        ? 'border-border/70 bg-surface/32'
                                        : 'border-border/55 bg-background/75'
                                    }`}>
                                      {snippetLines.map((line, index) => (
                                        <div
                                          key={`${result.id}-snippet-${index}`}
                                          className={`truncate leading-5 ${index === 0 ? 'text-[13px] font-medium text-foreground/92' : 'text-[12px] text-foreground/72'}`}
                                        >
                                          {line || ' '}
                                        </div>
                                      ))}
                                    </div>

                                    <div className="mt-2 flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className="truncate text-[12px] font-medium text-foreground/88">
                                          {result.title}
                                        </div>
                                        {metaLine && (
                                          <div className="mt-0.5 truncate text-[10px] text-muted-foreground/62">
                                            {metaLine}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                                        {isLabelMatch && (
                                          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-200">
                                            {t('search.fullText.labelMatch', 'label')}
                                          </span>
                                        )}
                                        {roleBadge && (
                                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${roleBadge.className}`}>
                                            {roleBadge.label}
                                          </span>
                                        )}
                                        {timeLabel && (
                                          <span className="text-[10px] text-muted-foreground/65 tabular-nums">
                                            {timeLabel}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        <div className={`truncate text-[14px] leading-5 ${isSelected ? 'font-semibold text-foreground' : 'font-medium text-foreground/92'}`}>
                                          {result.title}
                                        </div>
                                        {metaLine && (
                                          <div className="mt-1 truncate text-[11px] text-muted-foreground/72">
                                            {metaLine}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                                        {isLabelMatch && (
                                          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-200">
                                            {t('search.fullText.labelMatch', 'label')}
                                          </span>
                                        )}
                                        {roleBadge && (
                                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${roleBadge.className}`}>
                                            {roleBadge.label}
                                          </span>
                                        )}
                                        {timeLabel && (
                                          <span className="text-[10px] text-muted-foreground/65 tabular-nums">
                                            {timeLabel}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {snippetLines.length > 0 && (
                                      <div className={`mt-3 rounded-xl border px-3 py-2.5 ${
                                        isSelected
                                          ? 'border-border/70 bg-surface/32'
                                          : 'border-border/55 bg-background/75'
                                      }`}>
                                        {snippetLines.map((line, index) => (
                                          <div
                                            key={`${result.id}-snippet-${index}`}
                                            className="truncate text-[12px] leading-5 text-foreground/76"
                                          >
                                            {line || ' '}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
            {results.length > 0 && !isSearching && <div ref={sentinelRef} className="h-1" aria-hidden="true" />}
          </div>
        </div>

        <div className="flex-1 h-full min-h-0 overflow-hidden bg-background">
          <SessionPreviewPanel
            result={selectedResult}
            context={context}
            onClose={onClose}
            onNavigate={handleSelect}
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-5 py-3 border-t border-border/70 bg-background flex-shrink-0">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface/40 px-2.5 py-1">
            <kbd className="text-[10px] font-mono">↑↓</kbd>
            <span className="text-[11px]">{t('command.actions.navigate', 'Navigate')}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface/40 px-2.5 py-1">
            <kbd className="text-[10px] font-mono">↵</kbd>
            <span className="text-[11px]">{t('command.actions.open', 'Open')}</span>
          </div>
        </div>
        <button
          onClick={handleSelect}
          disabled={!selectedResult}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-medium transition-all ${
            selectedResult
              ? 'border-foreground/10 bg-foreground text-background hover:opacity-90 cursor-pointer'
              : 'border-border/60 text-muted-foreground/45 cursor-not-allowed bg-surface/30'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>{t('command.actions.go')}</span>
          <kbd className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${
            selectedResult ? 'bg-background/10 text-background/90' : 'bg-surface text-muted-foreground/55'
          }`}>↵</kbd>
        </button>
      </div>
    </div>
  )
}
