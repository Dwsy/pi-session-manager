import { invoke as tauriInvoke } from '@tauri-apps/api/core'

import { invoke as httpInvoke, isTauri } from '@/transport'

import type {
  PsmDevPluginEntry,
  PsmNpmPluginEntry,
  PsmPluginDevBuildResult,
  PsmPluginMarketSearchResult,
  PsmPathPluginEntry,
  PsmPluginNpmOperationResult,
  PsmPluginPaths,
  PsmPluginsConfig,
} from './types'
import type { PsmPermission, PsmPluginSettingValue } from '@pi-session-manager/plugin-sdk'

export const defaultPsmPluginsConfig: PsmPluginsConfig = {
  version: 1,
  plugins: {},
  customPaths: [],
  devProjects: [],
}

function invokePluginCommand<T>(command: string, payload?: Record<string, unknown>) {
  if (isTauri()) {
    return tauriInvoke<T>(command, payload)
  }
  return httpInvoke<T>(command, payload)
}

const PSM_PLUGIN_GZIP_PREFIX = 'psm:gzip;base64,'

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

async function gzipDecompressToText(payload: string): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Gzip-compressed PSM plugin modules require DecompressionStream support')
  }
  const stream = new DecompressionStream('gzip')
  const writer = stream.writable.getWriter()
  const bytes = base64ToBytes(payload)
  const chunk = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(chunk).set(bytes)
  await writer.write(chunk)
  await writer.close()
  const response = new Response(stream.readable)
  return response.text()
}

async function decodePluginModuleSource(source: string): Promise<string> {
  if (!source.startsWith(PSM_PLUGIN_GZIP_PREFIX)) return source
  return gzipDecompressToText(source.slice(PSM_PLUGIN_GZIP_PREFIX.length))
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
  projectPath?: string | null
}): Promise<PsmPluginsConfig> {
  return invokePluginCommand<PsmPluginsConfig>('set_psm_plugin_enabled', {
    pluginId: options.pluginId,
    enabled: options.enabled,
    source: options.source,
    packageName: options.packageName ?? null,
    entryPath: options.entryPath ?? null,
    projectPath: options.projectPath ?? null,
  })
}

export async function setPsmPluginSettings(options: {
  pluginId: string
  settings: Record<string, PsmPluginSettingValue>
  source?: string
  packageName?: string | null
  entryPath?: string | null
  projectPath?: string | null
}): Promise<PsmPluginsConfig> {
  return invokePluginCommand<PsmPluginsConfig>('set_psm_plugin_settings', {
    pluginId: options.pluginId,
    settings: options.settings,
    source: options.source,
    packageName: options.packageName ?? null,
    entryPath: options.entryPath ?? null,
    projectPath: options.projectPath ?? null,
  })
}

export async function setPsmPluginPermissions(options: {
  pluginId: string
  permissionOverrides: Partial<Record<PsmPermission, boolean>>
  source?: string
  packageName?: string | null
  entryPath?: string | null
  projectPath?: string | null
}): Promise<PsmPluginsConfig> {
  return invokePluginCommand<PsmPluginsConfig>('set_psm_plugin_permissions', {
    pluginId: options.pluginId,
    permissionOverrides: options.permissionOverrides,
    source: options.source,
    packageName: options.packageName ?? null,
    entryPath: options.entryPath ?? null,
    projectPath: options.projectPath ?? null,
  })
}

export async function listNpmPsmPluginEntries(): Promise<PsmNpmPluginEntry[]> {
  return invokePluginCommand<PsmNpmPluginEntry[]>('list_npm_psm_plugin_entries')
}

export async function listPathPsmPluginEntries(): Promise<PsmPathPluginEntry[]> {
  return invokePluginCommand<PsmPathPluginEntry[]>('list_path_psm_plugin_entries')
}

export async function listDevPsmPluginEntries(): Promise<PsmDevPluginEntry[]> {
  return invokePluginCommand<PsmDevPluginEntry[]>('list_dev_psm_plugin_entries')
}

export async function searchPsmPluginMarket(options?: {
  query?: string
  size?: number
  from?: number
}): Promise<PsmPluginMarketSearchResult> {
  return invokePluginCommand<PsmPluginMarketSearchResult>('search_psm_plugin_market', {
    ...(options?.query !== undefined ? { query: options.query } : {}),
    ...(options?.size !== undefined ? { size: options.size } : {}),
    ...(options?.from !== undefined ? { from: options.from } : {}),
  })
}

export async function addPathPsmPlugin(entryPath: string): Promise<PsmPluginsConfig> {
  return invokePluginCommand<PsmPluginsConfig>('add_path_psm_plugin', { entryPath })
}

export async function removePathPsmPlugin(entryPath: string): Promise<PsmPluginsConfig> {
  return invokePluginCommand<PsmPluginsConfig>('remove_path_psm_plugin', { entryPath })
}

export async function addDevPsmPlugin(projectPath: string): Promise<PsmPluginsConfig> {
  return invokePluginCommand<PsmPluginsConfig>('add_dev_psm_plugin', { projectPath })
}

export async function removeDevPsmPlugin(projectPath: string): Promise<PsmPluginsConfig> {
  return invokePluginCommand<PsmPluginsConfig>('remove_dev_psm_plugin', { projectPath })
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

export async function buildDevPsmPlugin(projectPath: string): Promise<PsmPluginDevBuildResult> {
  return invokePluginCommand<PsmPluginDevBuildResult>('build_dev_psm_plugin', { projectPath })
}

export async function reloadPsmPlugins(): Promise<PsmNpmPluginEntry[]> {
  return invokePluginCommand<PsmNpmPluginEntry[]>('reload_psm_plugins')
}

export async function readNpmPsmPluginModuleSource(entryPath: string): Promise<string> {
  return decodePluginModuleSource(await invokePluginCommand<string>('read_npm_psm_plugin_module_source', { entryPath }))
}

export async function readPathPsmPluginModuleSource(entryPath: string): Promise<string> {
  return decodePluginModuleSource(await invokePluginCommand<string>('read_path_psm_plugin_module_source', { entryPath }))
}

export async function readDevPsmPluginModuleSource(entryPath: string, projectPath: string): Promise<string> {
  return decodePluginModuleSource(await invokePluginCommand<string>('read_dev_psm_plugin_module_source', { entryPath, projectPath }))
}

export async function getPsmPluginPaths(): Promise<PsmPluginPaths> {
  return invokePluginCommand<PsmPluginPaths>('get_psm_plugin_paths')
}
