import { toolRenderRegistry } from '@/plugins/tools-render/registry'
import { subagentToolPlugin } from './subagent'

/**
 * Extension tool plugins
 * Complex or third-party tools with heavy dependencies
 */
const EXTENSION_PLUGINS = [
  subagentToolPlugin,
]

/**
 * Register all extension tool render plugins
 * Complex tools: subagent (with Modal, multi-format support)
 * Idempotent: skips already registered plugins
 */
export function registerExtensionToolPlugins(): void {
  // Register extension plugins (idempotent)
  EXTENSION_PLUGINS.forEach(plugin => {
    if (!toolRenderRegistry.get(plugin.id)) {
      toolRenderRegistry.register(plugin)
    }
  })

}

// Export extension plugins for individual use
export { subagentToolPlugin }
