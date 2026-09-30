import { toolRenderRegistry } from '@/plugins/tools-render/registry'
import { bashToolPlugin, powershellToolPlugin } from './bash'
import { readToolPlugin } from './read'
import { writeToolPlugin } from './write'
import { editToolPlugin } from './edit'
import { codemodeToolPlugin } from './codemode'
import { genericToolPlugin } from './generic'

/**
 * Core built-in tool plugins
 * Simple, stable tools: bash, powershell, read, write, edit, codemode, generic
 */
const BUILTIN_PLUGINS = [
  bashToolPlugin,
  powershellToolPlugin,
  readToolPlugin,
  writeToolPlugin,
  editToolPlugin,
  codemodeToolPlugin,
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

}

// Export core plugins for individual use
export {
  bashToolPlugin,
  powershellToolPlugin,
  readToolPlugin,
  writeToolPlugin,
  editToolPlugin,
  codemodeToolPlugin,
  genericToolPlugin,
}
