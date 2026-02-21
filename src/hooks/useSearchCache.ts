import { useRef, useMemo } from 'react'
import type { SearchPluginResult } from '../plugins/types'

interface CacheEntry {
  results: SearchPluginResult[]
  timestamp: number
}

const CACHE_SIZE = 100
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Search cache hook
 * Caches search results using LRU strategy
 * 
 * ⚠️ Important: Use useMemo to ensure returned object reference is stable
 * Otherwise will cause useSearchPlugins' search function to change on every call, triggering infinite loop
 */
export function useSearchCache() {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map())
  
  // Use useMemo to ensure returned object is a stable reference
  // Empty dependency array means create only once, avoid infinite loops
  return useMemo(() => ({
    /**
     * Get cached results
     * @param query Query string
     * @returns Cached results or null
     */
    get: (query: string): SearchPluginResult[] | null => {
      const entry = cacheRef.current.get(query)
      
      if (!entry) return null
      
      // Check if expired
      if (Date.now() - entry.timestamp > CACHE_TTL) {
        cacheRef.current.delete(query)
        return null
      }
      
      return entry.results
    },
    
    /**
     * Set cached results
     * @param query Query string
     * @param results Search results
     */
    set: (query: string, results: SearchPluginResult[]): void => {
      // LRU: If cache is full, remove oldest
      if (cacheRef.current.size >= CACHE_SIZE) {
        const firstKey = cacheRef.current.keys().next().value
        if (firstKey !== undefined) {
          cacheRef.current.delete(firstKey)
        }
      }
      
      cacheRef.current.set(query, {
        results,
        timestamp: Date.now()
      })
    },
    
    /**
     * 清空缓存
     */
    clear: (): void => {
      cacheRef.current.clear()
    }
  }), []) // ⚠️ Empty dependency array is critical! Ensure object is created only once
}
