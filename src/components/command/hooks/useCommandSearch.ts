import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import type { SearchPluginResult, SearchContext } from '@/plugins/types'
import type { PluginRegistry } from '@/plugins/registry'
import { parseLeadingSourceFilterToken } from '@/utils/search'
import type { MessageSearchPluginOptions } from '@/plugins/message/MessageSearchPlugin'
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
  const [searchError, setSearchError] = useState<string | undefined>()

  ftsOptionsRef.current = ftsOptions
  resultsRef.current = results

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

  const loadMore = useCallback(() => {
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
          setTimeout(
            () => reject(new Error('Search timeout after 15 seconds')),
            15000,
          )
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

        const searchPromise =
          isLabelsBrowseMode && messagePlugin
            ? messagePlugin.search('', context)
            : search(normalizedQuery, {
                pluginIds: scopedPluginIds,
                cacheKeyParts: parts,
              })

        const pageResults = await Promise.race([searchPromise, timeoutPromise])

        if (
          controller.signal.aborted ||
          currentRequestId !== requestIdRef.current
        )
          return

        const currentPage = ftsOptionsRef.current.page || 0
        if (currentPage > 0) {
          setResults([...resultsRef.current, ...pageResults])
        } else {
          setResults(pageResults)
        }
        setIsSearching(false)
      } catch (error) {
        if (
          controller.signal.aborted ||
          currentRequestId !== requestIdRef.current
        )
          return
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
    context,
    activeTab,
    scopedPluginIds,
    registry,
    ftsOptions.roleFilter,
    ftsOptions.page,
    ftsOptions.globPattern,
  ])

  return {
    normalizedQuery,
    effectiveSourceFilter,
    effectiveSortMode,
    isLabelsBrowseMode,
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
