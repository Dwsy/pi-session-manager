import { Command } from 'cmdk'
import { Search, Loader2, FolderOpen, MessageSquare, FileText, SlidersHorizontal, Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { SearchPluginResult, SearchContext } from '../../plugins/types'
import { useSearchPlugins } from '../../hooks/useSearchPlugins'
import CommandItem from './CommandItem'
import CommandEmpty from './CommandEmpty'
import CommandLoading from './CommandLoading'
import CommandHints from './CommandHints'
import CommandError from './CommandError'
import { getPathBasename } from '../../utils/path'
import type { MessageSearchPluginOptions } from '../../plugins/message/MessageSearchPlugin'

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
}

type TabType = 'all' | 'message' | 'session' | 'project'

const TABS: { id: TabType; key: string; pluginId?: string; Icon: typeof Search }[] = [
  { id: 'all', key: 'tabs.all', Icon: Search },
  { id: 'message', key: 'tabs.message', pluginId: 'message-search', Icon: MessageSquare },
  { id: 'session', key: 'tabs.session', pluginId: 'session-search', Icon: FileText },
  { id: 'project', key: 'tabs.project', pluginId: 'project-search', Icon: FolderOpen },
]

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

  const currentProjectName = context.selectedProject
    ? getPathBasename(context.selectedProject)
    : null

  const scopedPluginIds = useMemo(() => {
    const currentTab = TABS.find(tab => tab.id === activeTab)
    return currentTab?.pluginId ? [currentTab.pluginId] : undefined
  }, [activeTab])

  useEffect(() => {
    requestIdRef.current += 1
    const currentRequestId = requestIdRef.current

    if (abortControllerRef.current) abortControllerRef.current.abort()
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query.trim()) {
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
          (messagePlugin as any).setFTSOptions({
            ftsMode: true,
            roleFilter: ftsOptions.roleFilter,
            globPattern: ftsOptions.globPattern,
            sortMode: ftsOptions.sortMode,
            page: ftsOptions.page || 0,
            pageSize: ftsOptions.pageSize || 20,
          })
        }

        const parts: string[] = [activeTab]
        if (ftsOptions.roleFilter !== 'all') parts.push(ftsOptions.roleFilter!)
        if (ftsOptions.sortMode !== 'newest') parts.push(ftsOptions.sortMode!)
        if (ftsOptions.page) parts.push(String(ftsOptions.page))

        const searchPromise = search(query, { pluginIds: scopedPluginIds, cacheKeyParts: parts })
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

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, search, setIsSearching, setResults, context.selectedProject, context.searchCurrentProjectOnly, context.sessions, activeTab, scopedPluginIds, registry, ftsOptions.roleFilter, ftsOptions.sortMode, ftsOptions.page, ftsOptions.globPattern])

  const loadMore = useCallback(() => {
    setFtsOptions({ ...ftsOptionsRef.current, page: (ftsOptionsRef.current.page || 0) + 1 })
  }, [])

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
      acc[tab.id] = tab.pluginId ? (groupedResults[tab.pluginId]?.length || 0) : results.length
      return acc
    }, {} as Record<TabType, number>)
  }, [groupedResults, results.length])

  return (
    <Command className="w-full" shouldFilter={false}>
      {/* Header: Search + Actions */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
        <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={t('command.placeholder', 'Search sessions, projects, messages...')}
          className="flex-1 bg-transparent border-0 outline-none text-[15px] text-foreground placeholder:text-muted-foreground"
        />
        {isSearching && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`relative p-2 rounded-lg transition-colors flex-shrink-0 ${
            showFilters ? 'bg-blue-500/10 text-blue-400' : 'text-muted-foreground hover:text-foreground hover:bg-surface'
          }`}
          title="Filters"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
        <button
          onClick={() => { if (currentProjectName) setSearchCurrentProjectOnly(!searchCurrentProjectOnly) }}
          disabled={!currentProjectName}
          className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
            !currentProjectName ? 'text-muted-foreground/40 cursor-not-allowed' :
            searchCurrentProjectOnly ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground hover:bg-surface'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        <kbd className="px-2 py-0.5 text-[10px] text-muted-foreground bg-surface rounded border border-border/70 flex-shrink-0 font-mono">ESC</kbd>
      </div>

      {/* Filter Row */}
      {showFilters && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-border bg-surface/30 overflow-x-auto custom-scrollbar">
          <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium flex-shrink-0">role</span>
          {([
            { value: 'all' as const, label: 'All' },
            { value: 'user' as const, label: 'U' },
            { value: 'assistant' as const, label: 'AI' },
          ]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFtsOptions({ ...ftsOptions, roleFilter: value, page: 0 })}
              className={`px-2 py-0.5 text-xs rounded-md transition-all flex-shrink-0 ${
                ftsOptions.roleFilter === value ? 'bg-blue-500/15 text-blue-400 font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-surface'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="w-px h-4 bg-border/50 flex-shrink-0" />
          <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider font-medium flex-shrink-0">sort</span>
          {(['newest', 'oldest', 'score'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setFtsOptions({ ...ftsOptions, sortMode: mode, page: 0 })}
              className={`px-2 py-0.5 text-xs rounded-md transition-all flex-shrink-0 capitalize ${
                ftsOptions.sortMode === mode ? 'bg-blue-500/15 text-blue-400 font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-surface'
              }`}
            >
              {mode}
            </button>
          ))}
          <div className="w-px h-4 bg-border/50 flex-shrink-0" />
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Globe className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
            <input
              type="text"
              value={ftsOptions.globPattern || ''}
              onChange={e => setFtsOptions({ ...ftsOptions, globPattern: e.target.value || undefined, page: 0 })}
              placeholder="path..."
              className="flex-1 min-w-0 px-1.5 py-0.5 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none border-b border-transparent focus:border-blue-400/50 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0.5 px-5 py-1.5 border-b border-border bg-background">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors ${
                isActive ? 'bg-foreground/10 text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-surface/60'
              }`}
            >
              <tab.Icon className="w-3.5 h-3.5" />
              <span>{t(`command.${tab.key}`)}</span>
              {tabCounts[tab.id] > 0 && (
                <span className={`min-w-[14px] h-[14px] px-0.5 rounded text-[10px] leading-[14px] font-semibold text-center tabular-nums ${
                  isActive ? 'bg-foreground text-background' : 'bg-surface text-foreground/50'
                }`}>
                  {tabCounts[tab.id]}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Summary */}
      {!!query && !isSearching && !searchError && (
        <div className="px-5 py-1.5 border-b border-border/50 text-xs text-muted-foreground">
          {t('command.summary.results', { count: results.length, defaultValue: `${results.length} results` })}
        </div>
      )}

      {/* Results */}
      <div id="search-results-wrapper" className="max-h-[60vh] overflow-y-auto">
        <Command.List className="p-3">
          {isSearching && <CommandLoading />}
          {!isSearching && searchError && <CommandError error={searchError} />}
          {!isSearching && !searchError && results.length === 0 && query && <CommandEmpty query={query} />}
          {!isSearching && !searchError && !query && <CommandHints />}
          {!isSearching && !searchError && Object.entries(groupedResults).map(([pluginId, pluginResults]) => {
            if (activeTab !== 'all' && activeTab !== TABS.find(tab => tab.pluginId === pluginId)?.id) return null
            const plugin = registry.get(pluginId)
            if (!plugin) return null
            return (
              <Command.Group key={pluginId} heading={activeTab === 'all' ? plugin.name : undefined} className="mb-3">
                {pluginResults.map(result => (
                  <CommandItem
                    key={result.id}
                    result={result}
                    plugin={plugin}
                    onSelect={() => { plugin.onSelect(result, context); onClose() }}
                  />
                ))}
              </Command.Group>
            )
          })}
          {results.length > 0 && !isSearching && <div ref={sentinelRef} className="h-1" aria-hidden="true" />}
        </Command.List>
      </div>
    </Command>
  )
}
