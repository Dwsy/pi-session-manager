import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import type { SearchPluginResult, SearchContext, SearchPlugin } from '@/plugins/types'
import type { PluginRegistry } from '@/plugins/registry'
import { parseLeadingSourceFilterToken } from '@/utils/search'
import type {
  MessageSearchPageResult,
  MessageSearchPagination,
  MessageSearchPluginOptions,
} from '@/plugins/message/MessageSearchPlugin'
import type { FullTextSearchSourceFilter } from '@/types'

interface UseCommandSearchParams {
  query: string
  setQuery: (query: string) => void
  activeTab: 'all' | 'message' | 'session' | 'project'
  ftsOptions: MessageSearchPluginOptions
  setFtsOptions: (options: MessageSearchPluginOptions) => void
  search: (
    query: string,
    options?: { pluginIds?: string[]; cacheKeyParts?: string[] },
  ) => Promise<SearchPluginResult[]>
  registry: PluginRegistry
  results: SearchPluginResult[]
  setResults: (results: SearchPluginResult[]) => void
  setIsSearching: (isSearching: boolean) => void
  context: SearchContext
}

type MessageSearchPluginWithOptions = SearchPlugin & {
  setFTSOptions(options: MessageSearchPluginOptions): void
}

type PaginatedMessageSearchPlugin = SearchPlugin & {
  searchPage(
    query: string,
    context: SearchContext,
    options: MessageSearchPluginOptions,
  ): Promise<MessageSearchPageResult>
}

const EMPTY_PAGINATION: MessageSearchPagination = {
  totalHits: 0,
  hasMore: false,
}

function hasMessageSearchOptions(
  plugin: SearchPlugin | undefined,
): plugin is MessageSearchPluginWithOptions {
  if (!plugin) return false

  const candidate = plugin as Partial<MessageSearchPluginWithOptions>
  return typeof candidate.setFTSOptions === 'function'
}

function isPaginatedMessageSearchPlugin(
  plugin: SearchPlugin | undefined,
): plugin is PaginatedMessageSearchPlugin {
  if (!plugin) return false

  const candidate = plugin as Partial<PaginatedMessageSearchPlugin>
  return typeof candidate.searchPage === 'function'
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Search failed'
}

export function useCommandSearch({
  query,
  setQuery,
  activeTab,
  ftsOptions,
  setFtsOptions,
  search,
  registry,
  results,
  setResults,
  setIsSearching,
  context,
}: UseCommandSearchParams) {
  const debounceRef = useRef<NodeJS.Timeout>()
  const abortControllerRef = useRef<AbortController>()
  const requestIdRef = useRef(0)
  const ftsOptionsRef = useRef(ftsOptions)
  const resultsRef = useRef(results)
  const contextRef = useRef(context)
  const [searchError, setSearchError] = useState<string | undefined>()
  const [hasMore, setHasMore] = useState(false)
  const [totalHits, setTotalHits] = useState(0)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | undefined>()
  const [loadMoreRetryKey, setLoadMoreRetryKey] = useState(0)
  const sourceFilterPaginationEnabledRef = useRef(false)
  const hasMoreRef = useRef(false)
  const isLoadingMoreRef = useRef(false)
  const isInitialSearchingRef = useRef(false)
  const loadMoreErrorRef = useRef<string | undefined>()

  ftsOptionsRef.current = ftsOptions
  resultsRef.current = results
  contextRef.current = context

  const supportsMessageFilters = activeTab === 'all' || activeTab === 'message'
  const parsedSourceToken = useMemo(
    () => parseLeadingSourceFilterToken(query),
    [query],
  )

  const normalizedQuery =
    supportsMessageFilters && parsedSourceToken.sourceFilter
      ? parsedSourceToken.normalizedQuery
      : query

  const effectiveSourceFilter: FullTextSearchSourceFilter = supportsMessageFilters
    ? parsedSourceToken.sourceFilter || ftsOptions.sourceFilter || 'all'
    : 'all'

  const sourceFilterPaginationEnabled =
    supportsMessageFilters && effectiveSourceFilter !== 'all'

  sourceFilterPaginationEnabledRef.current = sourceFilterPaginationEnabled
  hasMoreRef.current = hasMore
  isLoadingMoreRef.current = isLoadingMore
  loadMoreErrorRef.current = loadMoreError

  const isLabelsBrowseMode =
    supportsMessageFilters &&
    effectiveSourceFilter === 'labels_only' &&
    !normalizedQuery.trim()

  const effectiveSortMode =
    isLabelsBrowseMode && ftsOptions.sortMode === 'score'
      ? 'newest'
      : ftsOptions.sortMode || 'newest'

  const scopedPluginIds = useMemo(() => {
    if (activeTab === 'all' && effectiveSourceFilter !== 'all') {
      return ['message-search']
    }

    const tabMap: Record<string, string | undefined> = {
      all: undefined,
      message: 'message-search',
      session: 'session-search',
      project: 'project-search',
    }
    const pluginId = tabMap[activeTab]
    return pluginId ? [pluginId] : undefined
  }, [activeTab, effectiveSourceFilter])

  const resetPagination = useCallback(() => {
    setHasMore(false)
    setTotalHits(0)
    setIsLoadingMore(false)
    setLoadMoreError(undefined)
    hasMoreRef.current = false
    isLoadingMoreRef.current = false
    loadMoreErrorRef.current = undefined
  }, [])

  const loadMore = useCallback(() => {
    if (!sourceFilterPaginationEnabledRef.current) return
    if (!hasMoreRef.current) return
    if (isInitialSearchingRef.current) return
    if (isLoadingMoreRef.current) return

    const shouldRetryCurrentPage = !!loadMoreErrorRef.current
    isLoadingMoreRef.current = true
    setIsLoadingMore(true)
    setLoadMoreError(undefined)
    loadMoreErrorRef.current = undefined

    if (shouldRetryCurrentPage) {
      setLoadMoreRetryKey((key) => key + 1)
      return
    }

    setFtsOptions({
      ...ftsOptionsRef.current,
      page: (ftsOptionsRef.current.page || 0) + 1,
    })
  }, [setFtsOptions])

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      if (!supportsMessageFilters) {
        setFtsOptions({ ...ftsOptionsRef.current, page: 0 })
        return
      }

      const parsed = parseLeadingSourceFilterToken(value)
      setFtsOptions({
        ...ftsOptionsRef.current,
        sourceFilter:
          parsed.sourceFilter || ftsOptionsRef.current.sourceFilter || 'all',
        page: 0,
      })
    },
    [setFtsOptions, setQuery, supportsMessageFilters],
  )

  const handleSourceFilterChange = useCallback(
    (nextSourceFilter: FullTextSearchSourceFilter) => {
      setFtsOptions({
        ...ftsOptionsRef.current,
        sourceFilter: nextSourceFilter,
        page: 0,
      })
      const parsed = parseLeadingSourceFilterToken(query)
      setQuery(parsed.sourceFilter ? parsed.normalizedQuery : query)
    },
    [query, setFtsOptions, setQuery],
  )

  const applySuggestedSourceFilter = useCallback(
    (nextSourceFilter: FullTextSearchSourceFilter) => {
      setFtsOptions({
        ...ftsOptionsRef.current,
        sourceFilter: nextSourceFilter,
        page: 0,
      })
      const token =
        nextSourceFilter === 'labels_only'
          ? '#labels '
          : nextSourceFilter === 'content_only'
            ? '#content '
            : '#all '
      setQuery(token)
    },
    [setFtsOptions, setQuery],
  )

  // Main search effect
  useEffect(() => {
    requestIdRef.current += 1
    const currentRequestId = requestIdRef.current

    if (abortControllerRef.current) abortControllerRef.current.abort()
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const requestPage = sourceFilterPaginationEnabled ? (ftsOptions.page || 0) : 0
    const isLoadMore = sourceFilterPaginationEnabled && requestPage > 0

    if (!normalizedQuery.trim() && !isLabelsBrowseMode) {
      setResults([])
      setIsSearching(false)
      isInitialSearchingRef.current = false
      resetPagination()
      setSearchError(undefined)
      return
    }

    if (!isLoadMore) {
      resetPagination()
      setIsSearching(true)
      isInitialSearchingRef.current = true
      setSearchError(undefined)
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Search timeout after 15 seconds')),
            15000,
          )
        })

        const messagePlugin = registry.get('message-search')
        let pageResults: SearchPluginResult[] = []
        let pagination = EMPTY_PAGINATION

        if (sourceFilterPaginationEnabled) {
          if (!isPaginatedMessageSearchPlugin(messagePlugin)) {
            throw new Error('Message search plugin does not support paginated source-filtered search')
          }
          if (messagePlugin.isEnabled?.(contextRef.current) === false) {
            throw new Error('Message search is unavailable in the current context')
          }

          const messageSearchOptions: MessageSearchPluginOptions = {
            ftsMode: true,
            roleFilter: ftsOptions.roleFilter,
            sourceFilter: effectiveSourceFilter,
            globPattern: ftsOptions.globPattern,
            sortMode: effectiveSortMode,
            page: requestPage,
            pageSize: ftsOptions.pageSize || 20,
          }

          const queryForPlugin = isLabelsBrowseMode ? '' : normalizedQuery
          const page = await Promise.race([
            messagePlugin.searchPage(queryForPlugin, contextRef.current, messageSearchOptions),
            timeoutPromise,
          ])
          pageResults = page.results
          pagination = page.pagination
        } else {
          if (hasMessageSearchOptions(messagePlugin)) {
            messagePlugin.setFTSOptions({
              ftsMode: true,
              roleFilter: ftsOptions.roleFilter,
              sourceFilter: effectiveSourceFilter,
              globPattern: ftsOptions.globPattern,
              sortMode: effectiveSortMode,
              page: requestPage,
              pageSize: ftsOptions.pageSize || 20,
            })
          }

          const parts: string[] = [activeTab]
          if (ftsOptions.roleFilter !== 'all') parts.push(ftsOptions.roleFilter!)
          if (effectiveSourceFilter !== 'all') parts.push(effectiveSourceFilter)
          if (effectiveSortMode !== 'newest') parts.push(effectiveSortMode)

          pageResults = await Promise.race([
            search(normalizedQuery, {
              pluginIds: scopedPluginIds,
              cacheKeyParts: parts,
            }),
            timeoutPromise,
          ])
        }

        if (
          controller.signal.aborted ||
          currentRequestId !== requestIdRef.current
        )
          return

        if (sourceFilterPaginationEnabled) {
          setHasMore(pagination.hasMore)
          setTotalHits(pagination.totalHits)
        }

        if (isLoadMore) {
          setResults([...resultsRef.current, ...pageResults])
          setLoadMoreError(undefined)
          loadMoreErrorRef.current = undefined
          setIsLoadingMore(false)
          isLoadingMoreRef.current = false
        } else {
          setResults(pageResults)
          setIsSearching(false)
          isInitialSearchingRef.current = false
        }
      } catch (error) {
        if (
          controller.signal.aborted ||
          currentRequestId !== requestIdRef.current
        )
          return
        console.error('[CommandMenu] Search error:', error)
        if (isLoadMore) {
          const message = getErrorMessage(error)
          setLoadMoreError(message)
          loadMoreErrorRef.current = message
          setIsLoadingMore(false)
          isLoadingMoreRef.current = false
          return
        }

        if (error instanceof Error && error.name !== 'AbortError') {
          setSearchError(getErrorMessage(error))
          setResults([])
        }
        resetPagination()
        setIsSearching(false)
        isInitialSearchingRef.current = false
      }
    }, 220)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [
    normalizedQuery,
    isLabelsBrowseMode,
    sourceFilterPaginationEnabled,
    effectiveSourceFilter,
    effectiveSortMode,
    search,
    setIsSearching,
    setResults,
    activeTab,
    scopedPluginIds,
    registry,
    resetPagination,
    ftsOptions.roleFilter,
    ftsOptions.page,
    ftsOptions.pageSize,
    ftsOptions.globPattern,
    loadMoreRetryKey,
  ])

  return {
    normalizedQuery,
    effectiveSourceFilter,
    effectiveSortMode,
    isLabelsBrowseMode,
    sourceFilterPaginationEnabled,
    hasMore,
    totalHits,
    isLoadingMore,
    loadMoreError,
    scopedPluginIds,
    supportsMessageFilters,
    parsedSourceToken,
    searchError,
    loadMore,
    handleQueryChange,
    handleSourceFilterChange,
    applySuggestedSourceFilter,
  }
}
