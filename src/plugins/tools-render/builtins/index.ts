import { toolRenderRegistry } from '../registry'
import { bashToolPlugin } from './bash'
import { readToolPlugin } from './read'
import { writeToolPlugin } from './write'
import { editToolPlugin } from './edit'
import { genericToolPlugin } from './generic'

/**
 * Core built-in tool plugins
 * Simple, stable tools: bash, read, write, edit, generic
 */
const BUILTIN_PLUGINS = [
  bashToolPlugin,
  readToolPlugin,
  writeToolPlugin,
  editToolPlugin,
]

/**
 * Register all core built-in tool render plugins
 * Idempotent: skips already registered plugins
 */
export function registerBuiltinToolPlugins(): void {
  // Register core tool plugins (idempotent)
  BUILTIN_PLUGINS.forEach(plugin => {
    if (!toolRenderRegistry.get(plugin.id)) {
      toolRenderRegistry.register(plugin)
    }
  })

  // Set fallback plugin (idempotent)
  if (!toolRenderRegistry.get('builtin-generic')) {
    toolRenderRegistry.setFallback(genericToolPlugin)
  }

  console.log('[Tool Plugins] Builtin plugins registered')
}

// Export core plugins for individual use
export {
  bashToolPlugin,
  readToolPlugin,
  writeToolPlugin,
  editToolPlugin,
  genericToolPlugin,
}
