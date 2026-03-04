import type { SearchPlugin, SearchContext, SearchPluginResult } from './types'

/**
 * Plugin registry
 * Manage registration, lookup, and execution of all search plugins
 */
export class PluginRegistry {
  private plugins: Map<string, SearchPlugin> = new Map()
  
  /**
   * Register plugin
   * @param plugin Search plugin
   * @throws If plugin ID already exists
   */
  register(plugin: SearchPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin with id "${plugin.id}" already registered`)
    }

    this.plugins.set(plugin.id, plugin)
    plugin.onMount?.()
  }
  
  /**
   * Unregister plugin
   * @param pluginId Plugin ID
   */
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId)
    if (plugin) {
      plugin.onUnmount?.()
      this.plugins.delete(pluginId)
    }
  }
  
  /**
   * Get plugin
   * @param pluginId Plugin ID
   * @returns Plugin instance or undefined
   */
  get(pluginId: string): SearchPlugin | undefined {
    return this.plugins.get(pluginId)
  }
  
  /**
   * Get all plugins
   * @returns Plugin array (sorted by priority)
   */
  getAll(): SearchPlugin[] {
    return Array.from(this.plugins.values())
      .sort((a, b) => b.priority - a.priority)
  }
  
  /**
   * Get available plugins
   * @param context Search context
   * @returns Available plugin array
   */
  getEnabled(context: SearchContext): SearchPlugin[] {
    return this.getAll().filter(plugin => 
      plugin.isEnabled ? plugin.isEnabled(context) : true
    )
  }
  
  /**
   * Execute search
   * @param query Search query
   * @param context Search context
   * @returns Merged search results
   */
  async search(
    query: string,
    context: SearchContext,
    scopedPluginIds?: string[]
  ): Promise<SearchPluginResult[]> {
    if (!query.trim()) {
      return []
    }
    
    const enabledPlugins = this.getEnabled(context)
    const scopedSet = scopedPluginIds?.length
      ? new Set(scopedPluginIds)
      : null
    const pluginsToSearch = scopedSet
      ? enabledPlugins.filter(plugin => scopedSet.has(plugin.id))
      : enabledPlugins
    
    // Run searches for all plugins in parallel
    const results = await Promise.all(
      pluginsToSearch.map(async plugin => {
        try {
          const pluginResults = await plugin.search(query, context)
          return pluginResults.map(result => ({
            ...result,
            pluginId: plugin.id,
            // Combined score = result score × plugin priority weight
            score: result.score * (plugin.priority / 100)
          }))
        } catch (error) {
          console.error(`[PluginRegistry] Plugin ${plugin.id} search failed:`, error)
          return []
        }
      })
    )
    
    // Merge and sort results
    return results
      .flat()
      .sort((a, b) => b.score - a.score)
  }
}

// Global singleton
export const pluginRegistry = new PluginRegistry()
