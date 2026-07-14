import type {
  PsmPermission,
  PsmPluginManifest,
  PsmPluginSettingValue,
  PsmAppSidebarViewRegistration,
  PsmAppViewRegistration,
  PsmProjectListActionRegistration,
  PsmSessionContextMenuActionRegistration,
  PsmSessionListActionRegistration,
  PsmSessionMainViewRegistration,
  PsmPluginCommandContext,
  PsmPluginCommandRegistration,
  PsmPluginToolRegistration,
  PsmSessionPanelRegistration,
  PsmSessionToolbarItemRegistration,
  PsmSessionTreeViewRegistration,
  PsmToolRendererRegistration,
} from '@pi-session-manager/plugin-sdk'

export type PsmPluginSource = 'builtin' | 'npm' | 'path' | 'dev'
export type PsmPluginStatusState = 'active' | 'disabled' | 'error'
export type PsmPluginDiagnosticLevel = 'info' | 'warn' | 'error'

export interface PsmPluginConfigEntry {
  enabled: boolean
  source?: PsmPluginSource | string
  packageName?: string | null
  entryPath?: string | null
  projectPath?: string | null
  settings?: Record<string, PsmPluginSettingValue>
  permissionOverrides?: Partial<Record<PsmPermission, boolean>>
}

export interface PsmPluginsConfig {
  version: number
  plugins: Record<string, PsmPluginConfigEntry>
  customPaths?: string[]
  devProjects?: string[]
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

export interface PsmDevPluginEntry {
  projectPath: string
  packageName?: string | null
  packageVersion?: string | null
  entryPath: string
  exportPath: string
  moduleModifiedMs?: number | null
  sourceHash?: string | null
}

export interface PsmPluginPaths {
  configPath: string
  npmDir: string
  customPaths: string[]
  devProjects: string[]
}

export interface PsmPluginNpmOperationResult {
  entries: PsmNpmPluginEntry[]
  stdout: string
  stderr: string
}

export interface PsmPluginDevBuildResult {
  entries: PsmDevPluginEntry[]
  stdout: string
  stderr: string
}

export interface PsmPluginMarketEntry {
  packageName: string
  packageVersion?: string | null
  description?: string | null
  author?: string | null
  keywords: string[]
  npmUrl?: string | null
  homepageUrl?: string | null
  repositoryUrl?: string | null
  imageUrl?: string | null
  weeklyDownloads?: number | null
  publishedAt?: string | null
  psmExtensionExports: string[]
  installed: boolean
}

export interface PsmPluginMarketSearchResult {
  query: string
  total: number
  results: PsmPluginMarketEntry[]
}

export interface PsmPluginLoadEntry {
  source: PsmPluginSource
  sourceId: string
  packageName?: string
  packageVersion?: string | null
  entryPath?: string
  projectPath?: string
  moduleModifiedMs?: number | null
  sourceHash?: string | null
  load(): Promise<unknown>
}

export interface PsmPluginDiagnostic {
  level: PsmPluginDiagnosticLevel
  phase?: 'discovery' | 'module-load' | 'manifest-validation' | 'activation' | 'command' | 'tool' | 'event-handler' | 'ui-render' | 'cleanup'
  message: string
  pluginId?: string
  sourceId?: string
  contributionId?: string
  stack?: string
  firstSeenAt?: string
  lastSeenAt?: string
  count?: number
}

export interface PsmPluginPermissionStatus {
  permission: PsmPermission
  granted: boolean
}

export interface PsmPluginStatus {
  id: string
  name: string
  version?: string
  source: PsmPluginSource
  sourceId: string
  packageName?: string
  entryPath?: string
  projectPath?: string
  enabled: boolean
  state: PsmPluginStatusState
  manifest?: PsmPluginManifest
  commands: string[]
  tools: string[]
  appViews?: string[]
  appSidebarViews?: string[]
  toolRenderers?: string[]
  diagnostics: PsmPluginDiagnostic[]
  permissions?: PsmPluginPermissionStatus[]
  settings?: Record<string, PsmPluginSettingValue>
  loadTimeMs?: number
  moduleModifiedMs?: number | null
  sourceHash?: string | null
}

export interface PsmPluginToolRuntimeRegistration extends PsmPluginToolRegistration {
  pluginId: string
}

export interface PsmPluginCommandRuntimeRegistration extends PsmPluginCommandRegistration {
  pluginId: string
}

export interface PsmAppViewRuntimeRegistration extends PsmAppViewRegistration {
  pluginId: string
}

export interface PsmAppSidebarViewRuntimeRegistration extends PsmAppSidebarViewRegistration {
  pluginId: string
}

export interface PsmSessionToolbarItemRuntimeRegistration extends PsmSessionToolbarItemRegistration {
  pluginId: string
}

export interface PsmSessionPanelRuntimeRegistration extends PsmSessionPanelRegistration {
  pluginId: string
}

export interface PsmSessionTreeViewRuntimeRegistration extends PsmSessionTreeViewRegistration {
  pluginId: string
}

export interface PsmSessionMainViewRuntimeRegistration extends PsmSessionMainViewRegistration {
  pluginId: string
}

export interface PsmToolRendererRuntimeRegistration extends PsmToolRendererRegistration {
  pluginId: string
}

export interface PsmSessionListActionRuntimeRegistration extends PsmSessionListActionRegistration {
  pluginId: string
}

export interface PsmProjectListActionRuntimeRegistration extends PsmProjectListActionRegistration {
  pluginId: string
}

export interface PsmSessionContextMenuActionRuntimeRegistration extends PsmSessionContextMenuActionRegistration {
  pluginId: string
}

export interface PsmPluginSessionUiSnapshot {
  ready: boolean
  appViews: PsmAppViewRuntimeRegistration[]
  appSidebarViews: PsmAppSidebarViewRuntimeRegistration[]
  sessionListActions: PsmSessionListActionRuntimeRegistration[]
  projectListActions: PsmProjectListActionRuntimeRegistration[]
  sessionContextMenuActions: PsmSessionContextMenuActionRuntimeRegistration[]
  toolbarItems: PsmSessionToolbarItemRuntimeRegistration[]
  panels: PsmSessionPanelRuntimeRegistration[]
  treeViews: PsmSessionTreeViewRuntimeRegistration[]
  mainViews: PsmSessionMainViewRuntimeRegistration[]
}

export type { PsmPluginCommandContext }
