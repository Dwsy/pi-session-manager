import { useCallback, useRef, useMemo } from 'react'
import { pluginRegistry } from '@/plugins/registry'
import type { SearchPluginResult, SearchContext } from '@/plugins/types'
import { useSearchCache } from './useSearchCache'

interface SearchPluginOptions {
  pluginIds?: string[]
  cacheKeyParts?: string[]
}

/**
 * Search plugin management hook
 */
export function useSearchPlugins(context: SearchContext) {
  const cache = useSearchCache()
  const contextRef = useRef(context)
  const sessionsVersionRef = useRef(0)

  // Update context ref
  contextRef.current = context

  // Only increment version when sessions actually change content, not just reference
  const sessionsSnapshot = useMemo(() => {
    return context.sessions.map(s => s.path).join(',')
  }, [context.sessions])
  const prevSnapshotRef = useRef<string>('')

  if (prevSnapshotRef.current !== sessionsSnapshot) {
    prevSnapshotRef.current = sessionsSnapshot
    sessionsVersionRef.current += 1
  }

  /**
   * Execute search
   * @param query Query string
   * @returns Search result array
   */
  const search = useCallback(async (
    query: string,
    options?: SearchPluginOptions
  ): Promise<SearchPluginResult[]> => {
    if (!query.trim()) {
      return []
    }

    const scopedPluginIds = options?.pluginIds?.length
      ? Array.from(new Set(options.pluginIds)).sort()
      : undefined
    const extraParts = options?.cacheKeyParts ?? []
    const cacheKey = [
      query.trim().toLowerCase(),
      scopedPluginIds?.join(',') || 'all',
      contextRef.current.selectedProject ?? '__all_projects__',
      contextRef.current.searchCurrentProjectOnly ? 'project_only' : 'project_all',
      `sessions_v${sessionsVersionRef.current}`,
      ...extraParts,
    ].join('::')

    // Check cache
    const cached = cache.get(cacheKey)
    if (cached) {
      return cached
    }

    // Execute search
    const results = await pluginRegistry.search(
      query,
      contextRef.current,
      scopedPluginIds,
    )

    // Cache results
    cache.set(cacheKey, results)

    return results
  }, [cache])

  return {
    registry: pluginRegistry,
    search
  }
}
