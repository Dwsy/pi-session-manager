import { useCallback, useRef } from 'react'
import { pluginRegistry } from '../plugins/registry'
import type { SearchPluginResult, SearchContext } from '../plugins/types'
import { useSearchCache } from './useSearchCache'

/**
 * 搜索插件管理 Hook
 */
export function useSearchPlugins(context: SearchContext) {
  const cache = useSearchCache()
  const contextRef = useRef(context)
  
  // Update context ref
  contextRef.current = context
  
  /**
   * 执行搜索
   * @param query 查询字符串
   * @returns 搜索结果数组
   */
  const search = useCallback(async (query: string): Promise<SearchPluginResult[]> => {
    if (!query.trim()) {
      return []
    }
    
    // Check cache
    const cached = cache.get(query)
    if (cached) {
      return cached
    }
    
    // Execute search
    const results = await pluginRegistry.search(query, contextRef.current)
    
    // Cache results
    cache.set(query, results)
    
    return results
  }, [cache])
  
  return {
    registry: pluginRegistry,
    search
  }
}
