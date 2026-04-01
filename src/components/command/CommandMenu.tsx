import { Command } from 'cmdk'
import { Search, Loader2, FolderOpen, MessageSquare, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SearchPluginResult, SearchContext } from '../../plugins/types'
import { useSearchPlugins } from '../../hooks/useSearchPlugins'
import CommandItem from './CommandItem'
import CommandEmpty from './CommandEmpty'
import CommandLoading from './CommandLoading'
import CommandHints from './CommandHints'
import CommandError from './CommandError'
import { getPathBasename } from '../../utils/path'

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
}

type TabType = 'all' | 'message' | 'session' | 'project'

const TABS: { id: TabType; key: string; pluginId?: string; shortcut: string }[] = [
  { id: 'all', key: 'tabs.all', shortcut: '1' },
  { id: 'message', key: 'tabs.message', pluginId: 'message-search', shortcut: '2' },
  { id: 'session', key: 'tabs.session', pluginId: 'session-search', shortcut: '3' },
  { id: 'project', key: 'tabs.project', pluginId: 'project-search', shortcut: '4' },
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
  setSearchCurrentProjectOnly
}: CommandMenuProps) {
  const { t } = useTranslation()
  const { registry, search } = useSearchPlugins(context)
  const debounceRef = useRef<NodeJS.Timeout>()
  const abortControllerRef = useRef<AbortController>()
  const requestIdRef = useRef(0)
  const [searchError, setSearchError] = useState<string | undefined>()
  const [activeTab, setActiveTab] = useState<TabType>('all')

  const currentProjectName = context.selectedProject
    ? getPathBasename(context.selectedProject)
    : null

  const scopedPluginIds = useMemo(() => {
    const currentTab = TABS.find(tab => tab.id === activeTab)
    if (!currentTab?.pluginId) {
      return undefined
    }
    return [currentTab.pluginId]
  }, [activeTab])

  useEffect(() => {
    requestIdRef.current += 1
    const currentRequestId = requestIdRef.current

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!query.trim()) {
      setResults([])
      setIsSearching(false)
      setSearchError(undefined)
      return
    }

    setIsSearching(true)
    setSearchError(undefined)

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Search timeout after 15 seconds'))
          }, 15000)
        })

        const searchPromise = search(query, {
          pluginIds: scopedPluginIds,
          cacheKeyParts: [activeTab]
        })

        const searchResults = await Promise.race([searchPromise, timeoutPromise])

        if (controller.signal.aborted || currentRequestId !== requestIdRef.current) {
          return
        }

        setResults(searchResults)
        setIsSearching(false)
      } catch (error) {
        if (controller.signal.aborted || currentRequestId !== requestIdRef.current) {
          return
        }

        console.error('[CommandMenu] Search error:', error)
        if (error instanceof Error && error.name !== 'AbortError') {
          setSearchError(error.message)
          setResults([])
        }
        setIsSearching(false)
      }
    }, 220)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [
    query,
    search,
    setIsSearching,
    setResults,
    context.selectedProject,
    context.searchCurrentProjectOnly,
    context.sessions,
    activeTab,
    scopedPluginIds,
  ])

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isModifierPressed = e.altKey || e.metaKey || e.ctrlKey
      if (!isModifierPressed) {
        return
      }

      const tabIndex = Number(e.key)
      if (!Number.isNaN(tabIndex) && tabIndex >= 1 && tabIndex <= TABS.length) {
        e.preventDefault()
        setActiveTab(TABS[tabIndex - 1].id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const groupedResults = useMemo(() => {
    return results.reduce((acc, result) => {
      if (!acc[result.pluginId]) {
        acc[result.pluginId] = []
      }
      acc[result.pluginId].push(result)
      return acc
    }, {} as Record<string, SearchPluginResult[]>)
  }, [results])

  const tabCounts = useMemo(() => {
    return TABS.reduce((acc, tab) => {
      if (!tab.pluginId) {
        acc[tab.id] = results.length
      } else {
        acc[tab.id] = groupedResults[tab.pluginId]?.length || 0
      }
      return acc
    }, {} as Record<TabType, number>)
  }, [groupedResults, results.length])

  const visibleResultsCount = useMemo(() => {
    if (activeTab === 'all') {
      return results.length
    }

    const pluginId = TABS.find(tab => tab.id === activeTab)?.pluginId
    if (!pluginId) {
      return 0
    }

    return groupedResults[pluginId]?.length || 0
  }, [activeTab, groupedResults, results.length])

  return (
    <Command
      className="w-full"
      shouldFilter={false}
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
        <Search className="w-5 h-5 text-muted-foreground" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={t('command.placeholder', 'Search sessions, projects, messages...')}
          className="flex-1 bg-transparent border-0 outline-none text-[15px] text-foreground placeholder:text-muted-foreground"
        />
        {isSearching && (
          <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
        )}

        <button
          onClick={() => {
            if (currentProjectName) {
              setSearchCurrentProjectOnly(!searchCurrentProjectOnly)
            }
          }}
          disabled={!currentProjectName}
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border motion-color motion-press focus-ring',
            !currentProjectName
              ? 'bg-surface-dark text-muted-foreground/60 cursor-not-allowed border-border'
              : searchCurrentProjectOnly
                ? 'bg-foreground text-background border-foreground/80 hover:opacity-90'
                : 'bg-surface text-foreground border-border hover:border-border-hover hover:bg-surface-dark'
          ].join(' ')}
          title={
            !currentProjectName
              ? t('command.noProjectSelected', 'Please select a project first')
              : searchCurrentProjectOnly
                ? t('command.searchAllProjects', 'Search all projects')
                : t('command.searchCurrentProject', 'Search current project only')
          }
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span className="max-w-[140px] truncate">
            {currentProjectName || t('command.allProjects', 'All Projects')}
          </span>
        </button>

        <kbd className="px-2 py-1 text-xs text-muted-foreground bg-surface rounded border border-border/70">
          ESC
        </kbd>
      </div>

      <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-border bg-background" role="tablist" aria-label="search tabs">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          let Icon = null
          if (tab.id === 'message') Icon = MessageSquare
          else if (tab.id === 'session') Icon = FileText
          else if (tab.id === 'project') Icon = FolderOpen

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={isActive}
              className={[
                'flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border motion-surface motion-color motion-press focus-ring',
                isActive
                  ? 'bg-foreground/10 text-foreground border-border-hover shadow-sm'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-surface hover:border-border/70'
              ].join(' ')}
              title={t('command.shortcuts.switchTab', 'Switch category') + ` (Alt+${tab.shortcut})`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{t(`command.${tab.key}`)}</span>
              <span className={[
                'min-w-[20px] h-[18px] px-1.5 rounded-full text-[11px] leading-[18px] font-semibold text-center tabular-nums',
                isActive
                  ? 'bg-foreground text-background'
                  : 'bg-surface-dark text-foreground/80 border border-border/80'
              ].join(' ')}>
                {tabCounts[tab.id] || 0}
              </span>
            </button>
          )
        })}
      </div>

      {!!query && !isSearching && !searchError && (
        <div className="px-5 py-2 border-b border-border/70 text-xs text-muted-foreground flex items-center justify-between">
          <span>
            {t('command.summary.results', {
              count: visibleResultsCount,
              defaultValue: `${visibleResultsCount}  results`
            })}
          </span>
          <span className="text-muted-foreground/80">
            {t('command.shortcuts.switchTab', 'Switch category')} Alt + 1/2/3/4
          </span>
        </div>
      )}

      <Command.List className="max-h-[60vh] overflow-y-auto p-3 motion-transform-opacity">
        {isSearching && <CommandLoading />}

        {!isSearching && searchError && (
          <CommandError error={searchError} />
        )}

        {!isSearching && !searchError && results.length === 0 && query && (
          <CommandEmpty query={query} />
        )}

        {!isSearching && !searchError && !query && (
          <CommandHints />
        )}

        {!isSearching && !searchError && Object.entries(groupedResults).map(([pluginId, pluginResults]) => {
          if (activeTab !== 'all' && activeTab !== TABS.find(tab => tab.pluginId === pluginId)?.id) {
            return null
          }

          const plugin = registry.get(pluginId)
          if (!plugin) return null

          return (
            <Command.Group
              key={pluginId}
              heading={activeTab === 'all' ? plugin.name : undefined}
              className="mb-3"
            >
              {pluginResults.map(result => (
                <CommandItem
                  key={result.id}
                  result={result}
                  plugin={plugin}
                  onSelect={() => {
                    plugin.onSelect(result, context)
                    onClose()
                  }}
                />
              ))}
            </Command.Group>
          )
        })}
      </Command.List>
    </Command>
  )
}
