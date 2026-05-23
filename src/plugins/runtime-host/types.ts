import type {
  PsmPluginManifest,
  PsmPluginSettingValue,
  PsmPluginToolRegistration,
  PsmSessionPanelRegistration,
  PsmSessionToolbarItemRegistration,
  PsmToolRendererRegistration,
} from '@pi-session-manager/plugin-sdk'

export type PsmPluginSource = 'builtin' | 'npm' | 'path'
export type PsmPluginStatusState = 'active' | 'disabled' | 'error'
export type PsmPluginDiagnosticLevel = 'info' | 'warn' | 'error'

export interface PsmPluginConfigEntry {
  enabled: boolean
  source?: PsmPluginSource | string
  packageName?: string | null
  entryPath?: string | null
  settings?: Record<string, PsmPluginSettingValue>
}

export interface PsmPluginsConfig {
  version: number
  plugins: Record<string, PsmPluginConfigEntry>
  customPaths?: string[]
}

export interface PsmNpmPluginEntry {
  packageName: string
  packageVersion?: string | null
  entryPath: string
  exportPath: string
  moduleModifiedMs?: number | null
  sourceHash?: string | null
}

export interface PsmPathPluginEntry {
  entryPath: string
  moduleModifiedMs?: number | null
  sourceHash?: string | null
}

export interface PsmPluginPaths {
  configPath: string
  npmDir: string
  customPaths: string[]
}

export interface PsmPluginNpmOperationResult {
  entries: PsmNpmPluginEntry[]
  stdout: string
  stderr: string
}

export interface PsmPluginLoadEntry {
  source: PsmPluginSource
  sourceId: string
  packageName?: string
  packageVersion?: string | null
  entryPath?: string
  moduleModifiedMs?: number | null
  sourceHash?: string | null
  load(): Promise<unknown>
}

export interface PsmPluginDiagnostic {
  level: PsmPluginDiagnosticLevel
  message: string
}

export interface PsmPluginStatus {
  id: string
  name: string
  version?: string
  source: PsmPluginSource
  sourceId: string
  packageName?: string
  entryPath?: string
  enabled: boolean
  state: PsmPluginStatusState
  manifest?: PsmPluginManifest
  commands: string[]
  tools: string[]
  toolRenderers?: string[]
  diagnostics: PsmPluginDiagnostic[]
  settings?: Record<string, PsmPluginSettingValue>
  loadTimeMs?: number
  moduleModifiedMs?: number | null
  sourceHash?: string | null
}

export interface PsmPluginToolRuntimeRegistration extends PsmPluginToolRegistration {
  pluginId: string
}

export interface PsmSessionToolbarItemRuntimeRegistration extends PsmSessionToolbarItemRegistration {
  pluginId: string
}

export interface PsmSessionPanelRuntimeRegistration extends PsmSessionPanelRegistration {
  pluginId: string
}

export interface PsmToolRendererRuntimeRegistration extends PsmToolRendererRegistration {
  pluginId: string
}

export interface PsmPluginSessionUiSnapshot {
  toolbarItems: PsmSessionToolbarItemRuntimeRegistration[]
  panels: PsmSessionPanelRuntimeRegistration[]
}

export type PsmPluginCommandHandler = (args: Record<string, unknown>) => Promise<unknown>
