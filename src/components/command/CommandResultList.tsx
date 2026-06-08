import { useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Loader2, Tag } from 'lucide-react'
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
  activeTab: 'all' | 'labels' | 'message' | 'session' | 'project'
  selectedResult: SearchPluginResult | null
  setSelectedResult: (result: SearchPluginResult | null) => void
  registry: PluginRegistry
  sourceFilterPaginationEnabled: boolean
  hasMore: boolean
  totalHits: number
  isLoadingMore: boolean
  loadMoreError: string | undefined
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
  sourceFilterPaginationEnabled,
  hasMore,
  totalHits,
  isLoadingMore,
  loadMoreError,
  loadMore,
}: CommandResultListProps) {
  const { t } = useTranslation()
  const wrapperRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    const wrapper = wrapperRef.current
    const sentinel = sentinelRef.current
    if (!wrapper || !sentinel || !sourceFilterPaginationEnabled || !hasMore || loadMoreError) return

    const canLoadMore = () => {
      return (
        sourceFilterPaginationEnabled &&
        hasMore &&
        !isSearching &&
        !isLoadingMore &&
        !loadMoreError
      )
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && canLoadMore()) {
          loadMore()
        }
      },
      {
        root: wrapper,
        rootMargin: '96px 0px',
      },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, isSearching, loadMore, loadMoreError, sourceFilterPaginationEnabled])

  const hasQuery = !!normalizedQuery.trim() || isLabelsBrowseMode
  const showPagination = sourceFilterPaginationEnabled
  const remaining = Math.max(0, totalHits - results.length)
  const showLoadMore = showPagination && hasMore && !searchError && results.length > 0
  const showLoadedCount = showPagination && hasQuery && totalHits > 0 && !showLoadMore
  const showAutoLoadMoreSentinel = showLoadMore && !loadMoreError
  const resultCountLabel = t('search.fullText.showingResults', 'Showing {{shown}} of {{total}}', {
    shown: results.length,
    total: totalHits,
  })
  const remainingLabel = t('search.fullText.loadMoreRemaining', 'Load more ({{count}} remaining)', {
    count: remaining,
  })
  const loadMoreLabel = loadMoreError
    ? t('search.fullText.retryLoadMore', 'Retry load more')
    : t('search.fullText.loadMore', 'Load more')

  return (
    <div
      id="search-results-wrapper"
      ref={wrapperRef}
      className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4"
      aria-busy={isSearching || isLoadingMore}
    >
      {showLoadedCount && (
        <div
          className="px-2 pb-3 text-[11px] text-muted-foreground/75 tabular-nums"
          aria-live="polite"
          aria-atomic="true"
        >
          {resultCountLabel}
        </div>
      )}
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
          const activeTabPluginId = TABS.find((tab) => tab.id === activeTab)?.pluginId
          if (activeTab !== 'all' && activeTabPluginId !== pluginId) return null
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
      {showAutoLoadMoreSentinel && (
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />
      )}
      {showLoadMore && (
        <div className="mt-4 border-t border-border/45 pt-3">
          <div className="flex min-h-9 items-center justify-between gap-3 px-2">
            <div className="min-w-0 text-[11px] text-muted-foreground/75 tabular-nums" aria-live="polite">
              <span className="block truncate">{resultCountLabel}</span>
              {!loadMoreError && remaining > 0 && (
                <span className="block truncate text-muted-foreground/55">{remainingLabel}</span>
              )}
            </div>
            <button
              type="button"
              onClick={loadMore}
              disabled={isLoadingMore}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-surface/45 px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-surface/65 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{loadMoreLabel}</span>
            </button>
          </div>
          {loadMoreError && (
            <div
              role="alert"
              className="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-[11px] text-destructive"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{loadMoreError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
