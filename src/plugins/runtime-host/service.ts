import { invoke as tauriInvoke } from '@tauri-apps/api/core'

import { invoke as httpInvoke, isTauri } from '@/transport'

import type {
  PsmNpmPluginEntry,
  PsmPathPluginEntry,
  PsmPluginNpmOperationResult,
  PsmPluginPaths,
  PsmPluginsConfig,
} from './types'
import type { PsmPluginSettingValue } from '@pi-session-manager/plugin-sdk'

export const defaultPsmPluginsConfig: PsmPluginsConfig = {
  version: 1,
  plugins: {},
  customPaths: [],
}

function invokePluginCommand<T>(command: string, payload?: Record<string, unknown>) {
  if (isTauri()) {
    return tauriInvoke<T>(command, payload)
  }
  return httpInvoke<T>(command, payload)
}

export async function loadPsmPluginConfig(): Promise<PsmPluginsConfig> {
  return invokePluginCommand<PsmPluginsConfig>('load_psm_plugin_config')
}

export async function setPsmPluginEnabled(options: {
  pluginId: string
  enabled: boolean
  source?: string
  packageName?: string | null
  entryPath?: string | null
}): Promise<PsmPluginsConfig> {
  return invokePluginCommand<PsmPluginsConfig>('set_psm_plugin_enabled', {
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
  return invokePluginCommand<PsmPluginsConfig>('set_psm_plugin_settings', {
    pluginId: options.pluginId,
    settings: options.settings,
    source: options.source,
    packageName: options.packageName ?? null,
    entryPath: options.entryPath ?? null,
  })
}

export async function listNpmPsmPluginEntries(): Promise<PsmNpmPluginEntry[]> {
  return invokePluginCommand<PsmNpmPluginEntry[]>('list_npm_psm_plugin_entries')
}

export async function listPathPsmPluginEntries(): Promise<PsmPathPluginEntry[]> {
  return invokePluginCommand<PsmPathPluginEntry[]>('list_path_psm_plugin_entries')
}

export async function addPathPsmPlugin(entryPath: string): Promise<PsmPluginsConfig> {
  return invokePluginCommand<PsmPluginsConfig>('add_path_psm_plugin', { entryPath })
}

export async function removePathPsmPlugin(entryPath: string): Promise<PsmPluginsConfig> {
  return invokePluginCommand<PsmPluginsConfig>('remove_path_psm_plugin', { entryPath })
}

export async function installPsmPlugin(packageName: string): Promise<PsmPluginNpmOperationResult> {
  return invokePluginCommand<PsmPluginNpmOperationResult>('install_psm_plugin', { packageName })
}

export async function uninstallPsmPlugin(packageName: string): Promise<PsmPluginNpmOperationResult> {
  return invokePluginCommand<PsmPluginNpmOperationResult>('uninstall_psm_plugin', { packageName })
}

export async function updatePsmPlugins(): Promise<PsmPluginNpmOperationResult> {
  return invokePluginCommand<PsmPluginNpmOperationResult>('update_psm_plugins')
}

export async function reloadPsmPlugins(): Promise<PsmNpmPluginEntry[]> {
  return invokePluginCommand<PsmNpmPluginEntry[]>('reload_psm_plugins')
}

export async function readNpmPsmPluginModuleSource(entryPath: string): Promise<string> {
  return invokePluginCommand<string>('read_npm_psm_plugin_module_source', { entryPath })
}

export async function readPathPsmPluginModuleSource(entryPath: string): Promise<string> {
  return invokePluginCommand<string>('read_path_psm_plugin_module_source', { entryPath })
}

export async function getPsmPluginPaths(): Promise<PsmPluginPaths> {
  return invokePluginCommand<PsmPluginPaths>('get_psm_plugin_paths')
}
