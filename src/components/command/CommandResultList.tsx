import { useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Tag } from 'lucide-react'
import type { SearchPluginResult } from '@/plugins/types'
import type { PluginRegistry } from '@/plugins/registry'
import CommandLoading from './CommandLoading'
import CommandError from './CommandError'
import CommandEmpty from './CommandEmpty'
import CommandHints from './CommandHints'
import CommandResultItem from './CommandResultItem'
import { TABS } from './utils'

interface CommandResultListProps {
  results: SearchPluginResult[]
  isSearching: boolean
  searchError: string | undefined
  normalizedQuery: string
  isLabelsBrowseMode: boolean
  activeTab: 'all' | 'message' | 'session' | 'project'
  selectedResult: SearchPluginResult | null
  setSelectedResult: (result: SearchPluginResult | null) => void
  registry: PluginRegistry
  loadMore: () => void
}

export default function CommandResultList({
  results,
  isSearching,
  searchError,
  normalizedQuery,
  isLabelsBrowseMode,
  activeTab,
  selectedResult,
  setSelectedResult,
  registry,
  loadMore,
}: CommandResultListProps) {
  const { t } = useTranslation()
  const sentinelRef = useRef<HTMLDivElement>(null)

  const groupedResults = useMemo(() => {
    return results.reduce(
      (acc: Record<string, SearchPluginResult[]>, r) => {
        if (!acc[r.pluginId]) acc[r.pluginId] = []
        acc[r.pluginId].push(r)
        return acc
      },
      {} as Record<string, SearchPluginResult[]>,
    )
  }, [results])

  // Infinite scroll
  useEffect(() => {
    const wrapper = document.getElementById('search-results-wrapper')
    if (!wrapper) return
    const handleScroll = () => {
      if (isSearching) return
      if (
        wrapper.scrollTop + wrapper.clientHeight >=
        wrapper.scrollHeight - 150
      ) {
        loadMore()
      }
    }
    wrapper.addEventListener('scroll', handleScroll, { passive: true })
    return () => wrapper.removeEventListener('scroll', handleScroll)
  }, [isSearching, loadMore])

  const hasQuery = !!normalizedQuery.trim() || isLabelsBrowseMode

  return (
    <div
      id="search-results-wrapper"
      className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4"
    >
      {isSearching && results.length === 0 && <CommandLoading />}
      {!isSearching && searchError && <CommandError error={searchError} />}
      {!isSearching &&
        !searchError &&
        results.length === 0 &&
        hasQuery &&
        (isLabelsBrowseMode ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Tag className="mb-3 h-12 w-12 text-amber-500/50" />
            <p className="text-sm text-muted-foreground">
              {t('search.fullText.noLabels', 'No labels found')}
            </p>
          </div>
        ) : (
          <CommandEmpty query={normalizedQuery} />
        ))}
      {!isSearching && !searchError && !hasQuery && <CommandHints />}
      {!isSearching &&
        !searchError &&
        Object.entries(groupedResults).map(([pluginId, pluginResults]) => {
          if (
            activeTab !== 'all' &&
            activeTab !== TABS.find((tab) => tab.pluginId === pluginId)?.id
          )
            return null
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
                {pluginResults.map((result) => (
                  <CommandResultItem
                    key={result.id}
                    result={result}
                    plugin={plugin}
                    isSelected={selectedResult?.id === result.id}
                    onSelect={() => setSelectedResult(result)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      {results.length > 0 && !isSearching && (
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />
      )}
    </div>
  )
}
