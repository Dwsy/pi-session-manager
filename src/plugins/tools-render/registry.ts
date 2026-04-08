import type { ToolRenderPlugin, BaseToolData } from './types'
import type { Content } from '@/types'
import { matchTool } from './types'

/**
 * Tool render plugin registry
 * Manages registration, lookup, and execution of all tool render plugins
 */
export class ToolRenderRegistry {
  private plugins: Map<string, ToolRenderPlugin> = new Map()
  private sortedCache: ToolRenderPlugin[] | null = null
  private fallbackPlugin: ToolRenderPlugin | null = null

  /**
   * Register a plugin
   * Idempotent: skips if plugin with same ID already registered
   * @param plugin - Tool render plugin to register
   */
  register<TData extends BaseToolData = BaseToolData>(plugin: ToolRenderPlugin<TData>): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[ToolRenderRegistry] Plugin "${plugin.id}" already registered, skipping`)
      return
    }

    this.plugins.set(plugin.id, plugin as unknown as ToolRenderPlugin)
    this.sortedCache = null // Clear cache for re-sort

    plugin.onMount?.()
  }

  /**
   * Unregister a plugin by ID
   * @param pluginId - Plugin ID to unregister
   */
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId)
    if (plugin) {
      plugin.onUnmount?.()
      this.plugins.delete(pluginId)
      this.sortedCache = null
    }
  }

  /**
   * Set the fallback plugin for unmatched tools
   * @param plugin - Fallback plugin (lowest priority)
   */
  setFallback<TData extends BaseToolData = BaseToolData>(plugin: ToolRenderPlugin<TData>): void {
    this.fallbackPlugin = plugin as unknown as ToolRenderPlugin
  }

  /**
   * Find matching plugin for a tool call
   * @param toolCall - Tool call content
   * @returns Matching plugin or fallback
   */
  findPlugin(toolCall: Content): ToolRenderPlugin {
    const sorted = this.getSortedPlugins()

    for (const plugin of sorted) {
      if (plugin.isEnabled && !plugin.isEnabled()) {
        continue
      }
      if (matchTool(plugin, toolCall)) {
        return plugin
      }
    }

    return this.fallbackPlugin ?? this.createFallback()
  }

  /**
   * Get all registered plugins sorted by priority (descending)
   * Uses cached result if available
   * @returns Sorted plugin array
   */
  getSortedPlugins(): ToolRenderPlugin[] {
    if (!this.sortedCache) {
      this.sortedCache = Array.from(this.plugins.values())
        .sort((a, b) => (b.priority || 50) - (a.priority || 50))
    }
    return this.sortedCache
  }

  /**
   * Get a specific plugin by ID
   * @param pluginId - Plugin ID
   * @returns Plugin instance or undefined
   */
  get(pluginId: string): ToolRenderPlugin | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * Check if any non-fallback plugin matches the tool
   * @param toolCall - Tool call to check
   * @returns Whether a custom plugin exists
   */
  hasMatch(toolCall: Content): boolean {
    return this.findPlugin(toolCall).id !== 'fallback'
  }

  /**
   * Clear all registered plugins
   * Calls onUnmount for each plugin
   */
  clear(): void {
    this.plugins.forEach(p => p.onUnmount?.())
    this.plugins.clear()
    this.sortedCache = null
  }

  /**
   * Create a default fallback plugin
   * @private
   */
  private createFallback(): ToolRenderPlugin {
    return {
      id: 'fallback',
      name: 'Generic Tool',
      match: () => true,
      priority: -Infinity,
      component: () => null,
    }
  }
}

/** Global singleton registry instance */
export const toolRenderRegistry = new ToolRenderRegistry()
