import type { PsmPluginCommandRuntimeRegistration } from '@/plugins/runtime-host'

export type CommandPaletteMode = 'search' | 'commands'

export interface CommandActionItem {
  id: string
  title: string
  description?: string
  category: string
  pluginId: string
  shortcut?: string
  disabled?: boolean
  disabledReason?: string
  command: PsmPluginCommandRuntimeRegistration
}
