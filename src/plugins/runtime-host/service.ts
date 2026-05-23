import { invoke as tauriInvoke } from '@tauri-apps/api/core'

import { isTauri } from '@/transport'

import type { PsmNpmPluginEntry, PsmPathPluginEntry, PsmPluginNpmOperationResult, PsmPluginPaths, PsmPluginsConfig } from './types'
import type { PsmPluginSettingValue } from '@pi-session-manager/plugin-sdk'

export const defaultPsmPluginsConfig: PsmPluginsConfig = {
  version: 1,
  plugins: {},
  customPaths: [],
}

const emptyNpmOperationResult: PsmPluginNpmOperationResult = {
  entries: [],
  stdout: '',
  stderr: '',
}

export async function loadPsmPluginConfig(): Promise<PsmPluginsConfig> {
  if (!isTauri()) return defaultPsmPluginsConfig
  return tauriInvoke<PsmPluginsConfig>('load_psm_plugin_config')
}

export async function setPsmPluginEnabled(options: {
  pluginId: string
  enabled: boolean
  source?: string
  packageName?: string | null
  entryPath?: string | null
}): Promise<PsmPluginsConfig> {
  if (!isTauri()) {
    return {
      version: 1,
      plugins: {
        [options.pluginId]: {
          enabled: options.enabled,
          source: options.source,
          packageName: options.packageName ?? null,
          entryPath: options.entryPath ?? null,
        },
      },
      customPaths: options.entryPath ? [options.entryPath] : [],
    }
  }

  return tauriInvoke<PsmPluginsConfig>('set_psm_plugin_enabled', {
    pluginId: options.pluginId,
    enabled: options.enabled,
    source: options.source,
    packageName: options.packageName ?? null,
    entryPath: options.entryPath ?? null,
  })
}

export async function setPsmPluginSettings(options: {
  pluginId: string
  settings: Record<string, PsmPluginSettingValue>
  source?: string
  packageName?: string | null
  entryPath?: string | null
}): Promise<PsmPluginsConfig> {
  if (!isTauri()) {
    return {
      version: 1,
      plugins: {
        [options.pluginId]: {
          enabled: true,
          source: options.source,
          packageName: options.packageName ?? null,
          entryPath: options.entryPath ?? null,
          settings: options.settings,
        },
      },
      customPaths: options.entryPath ? [options.entryPath] : [],
    }
  }

  return tauriInvoke<PsmPluginsConfig>('set_psm_plugin_settings', {
    pluginId: options.pluginId,
    settings: options.settings,
    source: options.source,
    packageName: options.packageName ?? null,
    entryPath: options.entryPath ?? null,
  })
}

export async function listNpmPsmPluginEntries(): Promise<PsmNpmPluginEntry[]> {
  if (!isTauri()) return []
  return tauriInvoke<PsmNpmPluginEntry[]>('list_npm_psm_plugin_entries')
}

export async function listPathPsmPluginEntries(): Promise<PsmPathPluginEntry[]> {
  if (!isTauri()) return []
  return tauriInvoke<PsmPathPluginEntry[]>('list_path_psm_plugin_entries')
}

export async function addPathPsmPlugin(entryPath: string): Promise<PsmPluginsConfig> {
  if (!isTauri()) {
    return { version: 1, plugins: {}, customPaths: [entryPath] }
  }
  return tauriInvoke<PsmPluginsConfig>('add_path_psm_plugin', { entryPath })
}

export async function removePathPsmPlugin(entryPath: string): Promise<PsmPluginsConfig> {
  if (!isTauri()) {
    return { version: 1, plugins: {}, customPaths: [] }
  }
  return tauriInvoke<PsmPluginsConfig>('remove_path_psm_plugin', { entryPath })
}

export async function installPsmPlugin(packageName: string): Promise<PsmPluginNpmOperationResult> {
  if (!isTauri()) return emptyNpmOperationResult
  return tauriInvoke<PsmPluginNpmOperationResult>('install_psm_plugin', { packageName })
}

export async function uninstallPsmPlugin(packageName: string): Promise<PsmPluginNpmOperationResult> {
  if (!isTauri()) return emptyNpmOperationResult
  return tauriInvoke<PsmPluginNpmOperationResult>('uninstall_psm_plugin', { packageName })
}

export async function updatePsmPlugins(): Promise<PsmPluginNpmOperationResult> {
  if (!isTauri()) return emptyNpmOperationResult
  return tauriInvoke<PsmPluginNpmOperationResult>('update_psm_plugins')
}

export async function reloadPsmPlugins(): Promise<PsmNpmPluginEntry[]> {
  if (!isTauri()) return []
  return tauriInvoke<PsmNpmPluginEntry[]>('reload_psm_plugins')
}

export async function readNpmPsmPluginModuleSource(entryPath: string): Promise<string> {
  if (!isTauri()) {
    throw new Error('NPM PSM plugins are only available in the Tauri runtime')
  }
  return tauriInvoke<string>('read_npm_psm_plugin_module_source', { entryPath })
}

export async function readPathPsmPluginModuleSource(entryPath: string): Promise<string> {
  if (!isTauri()) {
    throw new Error('Path PSM plugins are only available in the Tauri runtime')
  }
  return tauriInvoke<string>('read_path_psm_plugin_module_source', { entryPath })
}

export async function getPsmPluginPaths(): Promise<PsmPluginPaths> {
  if (!isTauri()) {
    return {
      configPath: '~/.pi/pi-session-manager/plugins.json',
      npmDir: '~/.pi/pi-session-manager/extensions/npm',
      customPaths: [],
    }
  }
  return tauriInvoke<PsmPluginPaths>('get_psm_plugin_paths')
}
