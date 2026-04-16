import { pluginRegistry } from './registry'
import { MessageSearchPlugin } from './message/MessageSearchPlugin'
import { ProjectSearchPlugin } from './project/ProjectSearchPlugin'
import { SessionSearchPlugin } from './session/SessionSearchPlugin'

let registered = false

/**
 * Register all built-in plugins
 * Prevent duplicate registration in React Strict Mode
 * Re-register on HMR so class method changes (like renderItem) take effect
 */
export function registerBuiltinPlugins() {
  // Always re-register on hot reload so plugin class updates are picked up
  if (import.meta.hot) {
    pluginRegistry.unregister('message-search')
    pluginRegistry.unregister('project-search')
    pluginRegistry.unregister('session-search')
  } else if (registered) {
    return
  }

  try {
    pluginRegistry.register(new MessageSearchPlugin())
    pluginRegistry.register(new ProjectSearchPlugin())
    pluginRegistry.register(new SessionSearchPlugin())

    registered = true
  } catch (error) {
    console.error('[Plugins] Failed to register builtin plugins:', error)
  }
}
