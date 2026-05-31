import {
  assertPsmPluginManifest,
  createPluginCapabilityClient,
  type PsmAgentClient,
  type PsmTransport,
  type PsmPluginDisposable,
  type PsmPluginEventEnvelope,
  type PsmPluginEventsClient,
  type PsmPluginHostContext,
  type PsmPluginI18nClient,
  type PsmPluginManifest,
  type PsmPluginModule,
  type PsmPluginLogger,
  type PsmPermission,
  type PsmPermissionContext,
  type PsmPluginSettingValue,
  type PsmPluginSettingsClient,
  type PsmPluginToolRegistration,
  type PsmToolRendererRegistration,
} from '@pi-session-manager/plugin-sdk'

import i18n from '@/i18n/config'
import { toolRenderRegistry } from '@/plugins/tools-render/registry'
import type { ToolRenderPlugin } from '@/plugins/tools-render/types'

import { appPsmTransport } from './appTransport'
import {
  createPsmAgentBridge,
  createPsmAgentBridgeCapabilities,
  createPsmAgentHostModelResolver,
} from './agentBridge'
import { psmRuntimeEventBus } from './eventBus'

import { builtinPsmPluginEntries } from './builtins'
import {
  listNpmPsmPluginEntries,
  listDevPsmPluginEntries,
  listPathPsmPluginEntries,
  loadPsmPluginConfig,
  readDevPsmPluginModuleSource,
  readNpmPsmPluginModuleSource,
  readPathPsmPluginModuleSource,
  setPsmPluginPermissions,
} from './service'
import { psmPluginPermissionRequests } from './permissionRequests'
import type { PsmPluginPermissionRequestInput } from './permissionRequests'
import { requiredRuntimeRequestPermissions } from './permissions'
import type {
  PsmPluginConfigEntry,
  PsmPluginCommandContext,
  PsmPluginCommandRuntimeRegistration,
  PsmPluginDiagnostic,
  PsmDevPluginEntry,
  PsmPathPluginEntry,
  PsmAppSidebarViewRuntimeRegistration,
  PsmAppViewRuntimeRegistration,
  PsmPluginLoadEntry,
  PsmPluginSessionUiSnapshot,
  PsmPluginSource,
  PsmPluginStatus,
  PsmPluginToolRuntimeRegistration,
  PsmPluginsConfig,
  PsmSessionMainViewRuntimeRegistration,
  PsmSessionPanelRuntimeRegistration,
  PsmSessionToolbarItemRuntimeRegistration,
  PsmSessionTreeViewRuntimeRegistration,
  PsmToolRendererRuntimeRegistration,
} from './types'

interface ActivePlugin {
  manifest: PsmPluginManifest
  source: PsmPluginSource
  sourceId: string
  packageName?: string
  projectPath?: string
  disposable?: PsmPluginDisposable
  deactivate?: () => void | Promise<void>
  cleanup: Array<() => void | Promise<void>>
}

interface PsmPluginHostServices {
  loadConfig(): Promise<PsmPluginsConfig>
  createAgentBridge?(params: { pluginId: string; permissions: PsmPermissionContext['permissions'] }): PsmAgentClient
  listNpmEntries(): Promise<Array<{
    packageName: string
    packageVersion?: string | null
    entryPath: string
    exportPath: string
    moduleModifiedMs?: number | null
    sourceHash?: string | null
  }>>
  listPathEntries(): Promise<PsmPathPluginEntry[]>
  listDevEntries(): Promise<PsmDevPluginEntry[]>
  readNpmModuleSource(entryPath: string): Promise<string>
  readPathModuleSource(entryPath: string): Promise<string>
  readDevModuleSource(entryPath: string, projectPath: string): Promise<string>
  setPluginPermissions(options: {
    pluginId: string
    permissionOverrides: Partial<Record<PsmPermission, boolean>>
    source?: string
    packageName?: string | null
    entryPath?: string | null
    projectPath?: string | null
  }): Promise<PsmPluginsConfig>
  requestPermission(request: PsmPluginPermissionRequestInput): Promise<boolean>
}

interface PsmPluginHostOptions {
  builtinEntries?: PsmPluginLoadEntry[]
  services?: Partial<PsmPluginHostServices>
}

const defaultServices: PsmPluginHostServices = {
  loadConfig: loadPsmPluginConfig,
  createAgentBridge: ({ pluginId, permissions }) => createPsmAgentBridge({
    pluginId,
    permissions: permissions ?? [],
    transport: appPsmTransport,
    resolveHostModel: createPsmAgentHostModelResolver(appPsmTransport),
    capabilities: createPsmAgentBridgeCapabilities(appPsmTransport),
  }),
  listNpmEntries: listNpmPsmPluginEntries,
  listPathEntries: listPathPsmPluginEntries,
  listDevEntries: listDevPsmPluginEntries,
  readNpmModuleSource: readNpmPsmPluginModuleSource,
  readPathModuleSource: readPathPsmPluginModuleSource,
  readDevModuleSource: readDevPsmPluginModuleSource,
  setPluginPermissions: setPsmPluginPermissions,
  requestPermission: (request) => psmPluginPermissionRequests.request(request),
}

function moduleFromUnknown(input: unknown): PsmPluginModule {
  if (typeof input !== 'object' || input === null) {
    throw new Error('plugin module must be an object')
  }
  return input as PsmPluginModule
}

function pluginEnabled(config: PsmPluginsConfig, manifest: PsmPluginManifest) {
  return config.plugins[manifest.id]?.enabled ?? true
}

function configEntryFor(
  config: PsmPluginsConfig,
  manifest: PsmPluginManifest,
  source: PsmPluginSource,
  packageName?: string,
  entryPath?: string,
  projectPath?: string,
): PsmPluginConfigEntry {
  return {
    enabled: pluginEnabled(config, manifest),
    source: config.plugins[manifest.id]?.source ?? source,
    packageName: config.plugins[manifest.id]?.packageName ?? packageName ?? manifest.package?.name ?? null,
    entryPath: config.plugins[manifest.id]?.entryPath ?? entryPath ?? null,
    projectPath: config.plugins[manifest.id]?.projectPath ?? projectPath ?? null,
    settings: config.plugins[manifest.id]?.settings ?? {},
    permissionOverrides: config.plugins[manifest.id]?.permissionOverrides ?? {},
  }
}

function defaultSettingsFor(manifest: PsmPluginManifest): Record<string, PsmPluginSettingValue> {
  const settings: Record<string, PsmPluginSettingValue> = {}
  for (const property of manifest.configuration?.properties ?? []) {
    if (property.default !== undefined) settings[property.key] = property.default
  }
  return settings
}

function settingsFor(manifest: PsmPluginManifest, entry: PsmPluginConfigEntry): Record<string, PsmPluginSettingValue> {
  return { ...defaultSettingsFor(manifest), ...(entry.settings ?? {}) }
}

function permissionStatusesFor(manifest: PsmPluginManifest, entry: PsmPluginConfigEntry) {
  return (manifest.permissions ?? []).map((permission) => ({
    permission,
    granted: permission === 'fs:read'
      ? entry.permissionOverrides?.[permission] === true
      : entry.permissionOverrides?.[permission] !== false,
  }))
}

function effectivePermissionsFor(manifest: PsmPluginManifest, entry: PsmPluginConfigEntry): PsmPermission[] {
  return permissionStatusesFor(manifest, entry)
    .filter((permission) => permission.granted)
    .map((permission) => permission.permission)
}

function mergePluginI18n(manifest: PsmPluginManifest) {
  for (const [language, resources] of Object.entries(manifest.i18n ?? {})) {
    i18n.addResourceBundle(language, 'translation', resources, true, true)
  }
}

function i18nClient(): PsmPluginI18nClient {
  return {
    get language() {
      return i18n.language
    },
    t(key, fallback, options) {
      return i18n.t(key, { defaultValue: fallback, ...(options ?? {}) })
    },
  }
}

function loggerClient(pluginId: string): PsmPluginLogger {
  const prefix = `[PSM plugins:${pluginId}]`
  const emit = (level: 'debug' | 'info' | 'warn' | 'error', message: string, details?: Record<string, unknown>) => {
    const payload = details && Object.keys(details).length > 0 ? { ...details } : undefined
    const output = payload ? `${prefix} ${message}` : `${prefix} ${message}`
    if (level === 'error') {
      console.error(output, payload)
      return
    }
    if (level === 'warn') {
      console.warn(output, payload)
      return
    }
    if (level === 'info') {
      console.info(output, payload)
      return
    }
    console.debug(output, payload)
  }

  return {
    debug: (message, details) => emit('debug', message, details),
    info: (message, details) => emit('info', message, details),
    warn: (message, details) => emit('warn', message, details),
    error: (message, details) => emit('error', message, details),
  }
}

function settingsClient(values: Record<string, PsmPluginSettingValue>): PsmPluginSettingsClient {
  return {
    get(key, fallback) {
      const value = values[key]
      return value === undefined ? fallback : (value as typeof fallback)
    },
    all() {
      return { ...values }
    },
  }
}

function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function diagnosticsMatch(a: PsmPluginDiagnostic, b: PsmPluginDiagnostic) {
  return a.level === b.level && a.message === b.message
}

function diagnostic(level: PsmPluginDiagnostic['level'], message: string): PsmPluginDiagnostic {
  return { level, message }
}

function payloadWithCurrentPermissions(payload: Record<string, unknown> | undefined, permissions: PsmPermissionContext) {
  if (!payload?.__psm || typeof payload.__psm !== 'object' || Array.isArray(payload.__psm)) return payload
  return {
    ...payload,
    __psm: {
      ...(payload.__psm as Record<string, unknown>),
      pluginId: permissions.pluginId,
      permissions: permissions.permissions ?? [],
    },
  }
}

function hasEventPermission(permissions: PsmPermissionContext | { permissions?: string[] }) {
  return (permissions.permissions ?? []).includes('events:read')
}

async function runCleanup(cleanup: Array<() => void | Promise<void>>, pluginId: string) {
  for (const dispose of cleanup.reverse()) {
    try {
      await dispose()
    } catch (error) {
      console.warn(`[PSM plugins] Failed to clean up event subscriptions for ${pluginId}:`, error)
    }
  }
  cleanup.length = 0
}

function createPluginEventsClient(
  pluginId: string,
  permissions: PsmPermissionContext,
  cleanup: Array<() => void | Promise<void>>,
): PsmPluginEventsClient {
  return {
    subscribe<Name extends string, Payload = unknown>(
      eventName: Name,
      handler: (event: PsmPluginEventEnvelope<Name, Payload>) => void | Promise<void>,
    ) {
      if (!hasEventPermission(permissions)) {
        throw new Error(`Plugin ${pluginId} must declare events:read to subscribe to ${String(eventName)}`)
      }

      const unsubscribe = psmRuntimeEventBus.subscribe(eventName, handler)
      cleanup.push(unsubscribe)
      return unsubscribe
    },
  }
}

function metadataFor(entry: PsmPluginLoadEntry) {
  return {
    moduleModifiedMs: entry.moduleModifiedMs,
    sourceHash: entry.sourceHash,
  }
}

function sourceModuleLoadEntry(options: {
  source: PsmPluginSource
  sourceId: string
  packageName?: string
  packageVersion?: string | null
  entryPath: string
  projectPath?: string
  moduleModifiedMs?: number | null
  sourceHash?: string | null
  readModuleSource(entryPath: string, projectPath?: string): Promise<string>
}): PsmPluginLoadEntry {
  return {
    source: options.source,
    sourceId: options.sourceId,
    packageName: options.packageName,
    packageVersion: options.packageVersion,
    entryPath: options.entryPath,
    projectPath: options.projectPath,
    moduleModifiedMs: options.moduleModifiedMs,
    sourceHash: options.sourceHash,
    async load() {
      const source = await options.readModuleSource(options.entryPath, options.projectPath)
      if (typeof Blob !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const blob = new Blob([source], { type: 'text/javascript;charset=utf-8' })
        const moduleUrl = URL.createObjectURL(blob)
        try {
          return await import(/* @vite-ignore */ moduleUrl)
        } catch {
          // Node/Vitest cannot import blob: modules, but WebView can. Fall back for tests and older runtimes.
        } finally {
          URL.revokeObjectURL(moduleUrl)
        }
      }
      const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`
      return import(/* @vite-ignore */ moduleUrl)
    },
  }
}

function npmEntryToLoadEntry(entry: {
  packageName: string
  packageVersion?: string | null
  entryPath: string
  exportPath: string
  moduleModifiedMs?: number | null
  sourceHash?: string | null
}, readModuleSource: (entryPath: string) => Promise<string>): PsmPluginLoadEntry {
  return sourceModuleLoadEntry({
    source: 'npm',
    sourceId: entry.entryPath,
    packageName: entry.packageName,
    packageVersion: entry.packageVersion,
    entryPath: entry.entryPath,
    moduleModifiedMs: entry.moduleModifiedMs,
    sourceHash: entry.sourceHash,
    readModuleSource,
  })
}

function pathEntryToLoadEntry(entry: PsmPathPluginEntry, readModuleSource: (entryPath: string) => Promise<string>): PsmPluginLoadEntry {
  return sourceModuleLoadEntry({
    source: 'path',
    sourceId: entry.entryPath,
    entryPath: entry.entryPath,
    moduleModifiedMs: entry.moduleModifiedMs,
    sourceHash: entry.sourceHash,
    readModuleSource,
  })
}

function devEntryToLoadEntry(entry: PsmDevPluginEntry, readModuleSource: (entryPath: string, projectPath: string) => Promise<string>): PsmPluginLoadEntry {
  return sourceModuleLoadEntry({
    source: 'dev',
    sourceId: entry.entryPath,
    packageName: entry.packageName ?? undefined,
    packageVersion: entry.packageVersion,
    entryPath: entry.entryPath,
    projectPath: entry.projectPath,
    moduleModifiedMs: entry.moduleModifiedMs,
    sourceHash: entry.sourceHash,
    readModuleSource: (entryPath, projectPath) => {
      if (!projectPath) throw new Error(`Missing dev plugin project path for ${entryPath}`)
      return readModuleSource(entryPath, projectPath)
    },
  })
}

export class PsmPluginHost {
  private readonly builtinEntries: PsmPluginLoadEntry[]
  private readonly services: PsmPluginHostServices
  private commands = new Map<string, PsmPluginCommandRuntimeRegistration>()
  private tools = new Map<string, PsmPluginToolRuntimeRegistration>()
  private toolRenderers = new Map<string, PsmToolRendererRuntimeRegistration>()
  private appViews = new Map<string, PsmAppViewRuntimeRegistration>()
  private appSidebarViews = new Map<string, PsmAppSidebarViewRuntimeRegistration>()
  private sessionToolbarItems = new Map<string, PsmSessionToolbarItemRuntimeRegistration>()
  private sessionPanels = new Map<string, PsmSessionPanelRuntimeRegistration>()
  private sessionTreeViews = new Map<string, PsmSessionTreeViewRuntimeRegistration>()
  private sessionMainViews = new Map<string, PsmSessionMainViewRuntimeRegistration>()
  private commandSnapshot: PsmPluginCommandRuntimeRegistration[] = []
  private sessionUiSnapshot: PsmPluginSessionUiSnapshot = { ready: false, appViews: [], appSidebarViews: [], toolbarItems: [], panels: [], treeViews: [], mainViews: [] }
  private listeners = new Set<() => void>()
  private activePlugins = new Map<string, ActivePlugin>()
  private statuses = new Map<string, PsmPluginStatus>()
  private reloadPromise: Promise<PsmPluginStatus[]> | null = null

  constructor(options: PsmPluginHostOptions = {}) {
    this.builtinEntries = options.builtinEntries ?? builtinPsmPluginEntries
    this.services = { ...defaultServices, ...options.services }
  }

  async reload(): Promise<PsmPluginStatus[]> {
    if (this.reloadPromise) return this.reloadPromise
    this.reloadPromise = this.reloadInternal()
      .then((plugins) => {
        this.refreshCommandSnapshot()
        this.refreshSessionUiSnapshot()
        this.notify()
        return plugins
      })
      .finally(() => {
        this.reloadPromise = null
      })
    return this.reloadPromise
  }

  listPlugins(): PsmPluginStatus[] {
    return Array.from(this.statuses.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  getCommandNames(): string[] {
    return Array.from(this.commands.keys()).sort()
  }

  listCommands(): PsmPluginCommandRuntimeRegistration[] {
    return this.commandSnapshot
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys()).sort()
  }

  getToolRendererIds(): string[] {
    return Array.from(this.toolRenderers.keys()).sort()
  }

  listAppViews(): PsmAppViewRuntimeRegistration[] {
    return Array.from(this.appViews.values()).sort((a, b) => a.id.localeCompare(b.id))
  }

  listAppSidebarViews(): PsmAppSidebarViewRuntimeRegistration[] {
    return Array.from(this.appSidebarViews.values()).sort((a, b) => a.id.localeCompare(b.id))
  }

  listSessionToolbarItems(): PsmSessionToolbarItemRuntimeRegistration[] {
    return Array.from(this.sessionToolbarItems.values()).sort((a, b) => a.id.localeCompare(b.id))
  }

  listSessionPanels(): PsmSessionPanelRuntimeRegistration[] {
    return Array.from(this.sessionPanels.values()).sort((a, b) => a.id.localeCompare(b.id))
  }

  listSessionTreeViews(): PsmSessionTreeViewRuntimeRegistration[] {
    return Array.from(this.sessionTreeViews.values()).sort((a, b) => a.id.localeCompare(b.id))
  }

  listSessionMainViews(): PsmSessionMainViewRuntimeRegistration[] {
    return Array.from(this.sessionMainViews.values()).sort((a, b) => a.id.localeCompare(b.id))
  }

  getSessionUiSnapshot(): PsmPluginSessionUiSnapshot {
    return this.sessionUiSnapshot
  }

  recordUiRenderError(pluginId: string, contributionId: string, error: unknown) {
    const status = this.statuses.get(pluginId)
    if (!status) return

    const nextDiagnostic = diagnostic('warn', `UI contribution failed to render (${contributionId}): ${normalizeError(error)}`)
    if (status.diagnostics.some((item) => diagnosticsMatch(item, nextDiagnostic))) return

    this.statuses.set(pluginId, {
      ...status,
      diagnostics: [...status.diagnostics, nextDiagnostic],
    })
    this.notify()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private refreshSessionUiSnapshot() {
    this.sessionUiSnapshot = {
      ready: true,
      appViews: this.listAppViews(),
      appSidebarViews: this.listAppSidebarViews(),
      toolbarItems: this.listSessionToolbarItems(),
      panels: this.listSessionPanels(),
      treeViews: this.listSessionTreeViews(),
      mainViews: this.listSessionMainViews(),
    }
  }

  private refreshCommandSnapshot() {
    this.commandSnapshot = Array.from(this.commands.values()).sort((a, b) => a.title.localeCompare(b.title))
  }

  private unregisterToolRenderers(ids: string[] = Array.from(this.toolRenderers.keys())) {
    for (const id of ids) {
      toolRenderRegistry.unregister(id)
      this.toolRenderers.delete(id)
    }
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }

  async executeCommand(
    name: string,
    args: Record<string, unknown> = {},
    context?: PsmPluginCommandContext,
  ): Promise<unknown> {
    const command = this.commands.get(name)
    if (!command) throw new Error(`PSM plugin command not found: ${name}`)
    return command.run(args, context)
  }

  async runTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const tool = this.tools.get(name)
    if (!tool) throw new Error(`PSM plugin tool not found: ${name}`)
    return tool.run(args)
  }

  private async reloadInternal(): Promise<PsmPluginStatus[]> {
    await this.disposeAll()
    this.unregisterToolRenderers()
    this.commands.clear()
    this.tools.clear()
    this.appViews.clear()
    this.appSidebarViews.clear()
    this.sessionToolbarItems.clear()
    this.sessionPanels.clear()
    this.sessionTreeViews.clear()
    this.sessionMainViews.clear()
    this.statuses.clear()

    const config = await this.services.loadConfig()
    const npmEntries = await this.services.listNpmEntries().catch((error) => {
      this.statuses.set('npm-discovery', {
        id: 'npm-discovery',
        name: 'NPM plugin discovery',
        source: 'npm',
        sourceId: '~/.pi/pi-session-manager/extensions/npm',
        enabled: false,
        state: 'error',
        commands: [],
        tools: [],
        diagnostics: [diagnostic('error', normalizeError(error))],
      })
      return []
    })
    const pathEntries = await this.services.listPathEntries().catch((error) => {
      this.statuses.set('path-discovery', {
        id: 'path-discovery',
        name: 'Path plugin discovery',
        source: 'path',
        sourceId: 'plugins.json customPaths',
        enabled: false,
        state: 'error',
        commands: [],
        tools: [],
        diagnostics: [diagnostic('error', normalizeError(error))],
      })
      return []
    })
    const devEntries = await this.services.listDevEntries().catch((error) => {
      this.statuses.set('dev-discovery', {
        id: 'dev-discovery',
        name: 'Dev plugin discovery',
        source: 'dev',
        sourceId: 'plugins.json devProjects',
        enabled: false,
        state: 'error',
        commands: [],
        tools: [],
        diagnostics: [diagnostic('error', normalizeError(error))],
      })
      return []
    })
    const entries = [
      ...this.builtinEntries,
      ...npmEntries.map((entry) => npmEntryToLoadEntry(entry, this.services.readNpmModuleSource)),
      ...pathEntries.map((entry) => pathEntryToLoadEntry(entry, this.services.readPathModuleSource)),
      ...devEntries.map((entry) => devEntryToLoadEntry(entry, this.services.readDevModuleSource)),
    ]

    for (const entry of entries) {
      await this.loadEntry(entry, config)
    }

    return this.listPlugins()
  }

  private async ensureRuntimePermission(
    manifest: PsmPluginManifest,
    configEntry: PsmPluginConfigEntry,
    permissions: PsmPermissionContext,
    permission: PsmPermission,
  ) {
    const explicitlyGranted = configEntry.permissionOverrides?.[permission] === true
    if (permissions.permissions?.includes(permission) && (permission !== 'fs:read' || explicitlyGranted)) return
    if (!manifest.permissions?.includes(permission)) {
      throw new Error(`Plugin permission denied: ${manifest.id} did not declare ${permission}`)
    }
    if (permission !== 'fs:read') {
      throw new Error(`Plugin permission denied: ${manifest.id} missing ${permission}`)
    }

    const allowed = await this.services.requestPermission({
      pluginId: manifest.id,
      pluginName: manifest.name,
      permission,
    })
    if (!allowed) {
      throw new Error(`Plugin permission denied: ${manifest.id} missing ${permission}`)
    }

    const nextOverrides = { ...(configEntry.permissionOverrides ?? {}) }
    nextOverrides[permission] = true
    await this.services.setPluginPermissions({
      pluginId: manifest.id,
      permissionOverrides: nextOverrides,
      source: configEntry.source,
      packageName: configEntry.packageName ?? null,
      entryPath: configEntry.entryPath ?? null,
      projectPath: configEntry.projectPath ?? null,
    })

    configEntry.permissionOverrides = nextOverrides
    permissions.permissions = [...(permissions.permissions ?? []), permission]
    const status = this.statuses.get(manifest.id)
    if (status?.permissions) {
      this.statuses.set(manifest.id, {
        ...status,
        permissions: status.permissions.map((item) => item.permission === permission ? { ...item, granted: true } : item),
      })
      this.notify()
    }
  }

  private createRuntimePermissionTransport(
    manifest: PsmPluginManifest,
    configEntry: PsmPluginConfigEntry,
    permissions: PsmPermissionContext,
  ): PsmTransport {
    const ensureForCommand = async (command: string) => {
      for (const permission of requiredRuntimeRequestPermissions(command)) {
        await this.ensureRuntimePermission(manifest, configEntry, permissions, permission)
      }
    }

    return {
      async invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
        await ensureForCommand(command)
        return appPsmTransport.invoke<T>(command, payloadWithCurrentPermissions(payload, permissions))
      },
      stream<TEvent, TResult>(command: string, payload: Record<string, unknown> | undefined, handlers: { onEvent?: (event: TEvent) => void; onError?: (error: string) => void }) {
        if (!appPsmTransport.stream) return undefined
        return (async () => {
          await ensureForCommand(command)
          const result = appPsmTransport.stream?.<TEvent, TResult>(command, payloadWithCurrentPermissions(payload, permissions), handlers)
          if (!result) throw new Error(`PSM plugin stream command is unavailable: ${command}`)
          return result
        })()
      },
    }
  }

  private async loadEntry(entry: PsmPluginLoadEntry, config: PsmPluginsConfig) {
    const startedAt = Date.now()
    let module: PsmPluginModule
    try {
      module = moduleFromUnknown(await entry.load())
    } catch (error) {
      this.statuses.set(entry.sourceId, {
        id: entry.sourceId,
        name: entry.packageName ?? entry.sourceId,
        version: entry.packageVersion ?? undefined,
        source: entry.source,
        sourceId: entry.sourceId,
        packageName: entry.packageName,
        entryPath: entry.entryPath,
        projectPath: entry.projectPath,
        enabled: false,
        state: 'error',
        commands: [],
        tools: [],
        diagnostics: [diagnostic('error', `Failed to load module: ${normalizeError(error)}`)],
        loadTimeMs: Date.now() - startedAt,
        ...metadataFor(entry),
      })
      return
    }

    let manifest: PsmPluginManifest
    try {
      manifest = assertPsmPluginManifest(module.manifest)
    } catch (error) {
      const moduleKeys = Object.keys(module).sort().join(', ') || '(none)'
      this.statuses.set(entry.sourceId, {
        id: entry.sourceId,
        name: entry.packageName ?? entry.sourceId,
        version: entry.packageVersion ?? undefined,
        source: entry.source,
        sourceId: entry.sourceId,
        packageName: entry.packageName,
        entryPath: entry.entryPath,
        projectPath: entry.projectPath,
        enabled: false,
        state: 'error',
        commands: [],
        tools: [],
        diagnostics: [diagnostic('error', `${normalizeError(error)}; module exports: ${moduleKeys}`)],
        loadTimeMs: Date.now() - startedAt,
        ...metadataFor(entry),
      })
      return
    }

    mergePluginI18n(manifest)
    const existingStatus = this.statuses.get(manifest.id)
    if (existingStatus) {
      this.statuses.set(entry.sourceId, {
        id: entry.sourceId,
        name: manifest.name,
        version: manifest.version,
        source: entry.source,
        sourceId: entry.sourceId,
        packageName: entry.packageName,
        entryPath: entry.entryPath,
        projectPath: entry.projectPath,
        enabled: false,
        state: 'error',
        manifest,
        commands: [],
        tools: [],
        diagnostics: [diagnostic('error', `Duplicate plugin id ${manifest.id} already loaded from ${existingStatus.source}:${existingStatus.sourceId}`)],
        loadTimeMs: Date.now() - startedAt,
        ...metadataFor(entry),
      })
      return
    }

    const configEntry = configEntryFor(config, manifest, entry.source, entry.packageName, entry.entryPath, entry.projectPath)
    const settings = settingsFor(manifest, configEntry)
    const permissionStatuses = permissionStatusesFor(manifest, configEntry)
    const effectivePermissions = effectivePermissionsFor(manifest, configEntry)
    if (!configEntry.enabled) {
      this.statuses.set(manifest.id, {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        source: entry.source,
        sourceId: entry.sourceId,
        packageName: configEntry.packageName ?? undefined,
        entryPath: configEntry.entryPath ?? undefined,
        projectPath: configEntry.projectPath ?? undefined,
        enabled: false,
        state: 'disabled',
        manifest,
        commands: [],
        tools: [],
        diagnostics: [],
        permissions: permissionStatuses,
        settings,
        loadTimeMs: Date.now() - startedAt,
        ...metadataFor(entry),
      })
      return
    }

    const commandNames: string[] = []
    const toolNames: string[] = []
    const toolRendererIds: string[] = []
    const appViewIds: string[] = []
    const appSidebarViewIds: string[] = []
    const toolbarItemIds: string[] = []
    const panelIds: string[] = []
    const treeViewIds: string[] = []
    const mainViewIds: string[] = []
    const diagnostics: PsmPluginDiagnostic[] = []
    const permissions = {
      pluginId: manifest.id,
      permissions: effectivePermissions,
    }
    const transport = this.createRuntimePermissionTransport(manifest, configEntry, permissions)
    const cleanup: Array<() => void | Promise<void>> = []

    const context: PsmPluginHostContext = {
      manifest,
      permissions,
      events: createPluginEventsClient(manifest.id, permissions, cleanup),
      psm: createPluginCapabilityClient({
        transport,
        permissions,
        agent: this.services.createAgentBridge?.({ pluginId: manifest.id, permissions: effectivePermissions }),
      }),
      settings: settingsClient(settings),
      i18n: i18nClient(),
      log: loggerClient(manifest.id),
      ui: {
        registerAppView: (view) => {
          if (this.appViews.has(view.id)) {
            diagnostics.push(diagnostic('warn', `App view already registered: ${view.id}`))
            return
          }
          this.appViews.set(view.id, { ...view, pluginId: manifest.id })
          appViewIds.push(view.id)
        },
        registerAppSidebarView: (view) => {
          if (this.appSidebarViews.has(view.id)) {
            diagnostics.push(diagnostic('warn', `App sidebar view already registered: ${view.id}`))
            return
          }
          this.appSidebarViews.set(view.id, { ...view, pluginId: manifest.id })
          appSidebarViewIds.push(view.id)
        },
        registerSessionToolbarItem: (item) => {
          if (this.sessionToolbarItems.has(item.id)) {
            diagnostics.push(diagnostic('warn', `Session toolbar item already registered: ${item.id}`))
            return
          }
          this.sessionToolbarItems.set(item.id, { ...item, pluginId: manifest.id })
          toolbarItemIds.push(item.id)
        },
        registerSessionPanel: (panel) => {
          if (this.sessionPanels.has(panel.id)) {
            diagnostics.push(diagnostic('warn', `Session panel already registered: ${panel.id}`))
            return
          }
          this.sessionPanels.set(panel.id, { ...panel, pluginId: manifest.id, side: panel.side ?? 'right' })
          panelIds.push(panel.id)
        },
        registerSessionTreeView: (view) => {
          if (this.sessionTreeViews.has(view.id)) {
            diagnostics.push(diagnostic('warn', `Session tree view already registered: ${view.id}`))
            return
          }
          this.sessionTreeViews.set(view.id, { ...view, pluginId: manifest.id })
          treeViewIds.push(view.id)
        },
        registerSessionMainView: (view) => {
          if (this.sessionMainViews.has(view.id)) {
            diagnostics.push(diagnostic('warn', `Session main view already registered: ${view.id}`))
            return
          }
          this.sessionMainViews.set(view.id, { ...view, pluginId: manifest.id })
          mainViewIds.push(view.id)
        },
        registerToolRenderer: (renderer: PsmToolRendererRegistration) => {
          if (this.toolRenderers.has(renderer.id) || toolRenderRegistry.get(renderer.id)) {
            diagnostics.push(diagnostic('warn', `Tool renderer already registered: ${renderer.id}`))
            return
          }
          this.toolRenderers.set(renderer.id, { ...renderer, pluginId: manifest.id })
          toolRenderRegistry.register(renderer as unknown as ToolRenderPlugin)
          toolRendererIds.push(renderer.id)
        },
      },
      registerCommand: (commandOrName, handler) => {
        if (typeof commandOrName === 'string' && !handler) {
          diagnostics.push(diagnostic('warn', `Command registration is missing a handler: ${commandOrName}`))
          return
        }

        const command = typeof commandOrName === 'string'
          ? {
              id: commandOrName,
              title: commandOrName,
              category: manifest.name,
              run: handler!,
            }
          : commandOrName

        if (this.commands.has(command.id)) {
          diagnostics.push(diagnostic('warn', `Command already registered: ${command.id}`))
          return
        }
        this.commands.set(command.id, { ...command, pluginId: manifest.id })
        commandNames.push(command.id)
      },
      registerTool: (name, tool: PsmPluginToolRegistration) => {
        if (this.tools.has(name)) {
          diagnostics.push(diagnostic('warn', `Tool already registered: ${name}`))
          return
        }
        this.tools.set(name, { ...tool, pluginId: manifest.id })
        toolNames.push(name)
      },
    }

    try {
      const activate = module.activate ?? module.default
      const disposable = activate ? await activate(context) : undefined
      this.activePlugins.set(manifest.id, {
        manifest,
        source: entry.source,
        sourceId: entry.sourceId,
        packageName: configEntry.packageName ?? undefined,
        projectPath: configEntry.projectPath ?? undefined,
        disposable: disposable && typeof disposable === 'object' ? disposable : undefined,
        deactivate: module.deactivate,
        cleanup,
      })
      this.statuses.set(manifest.id, {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        source: entry.source,
        sourceId: entry.sourceId,
        packageName: configEntry.packageName ?? undefined,
        entryPath: configEntry.entryPath ?? undefined,
        projectPath: configEntry.projectPath ?? undefined,
        enabled: true,
        state: 'active',
        manifest,
        commands: commandNames,
        tools: toolNames,
        appViews: appViewIds,
        appSidebarViews: appSidebarViewIds,
        toolRenderers: toolRendererIds,
        diagnostics,
        permissions: permissionStatuses,
        settings,
        loadTimeMs: Date.now() - startedAt,
        ...metadataFor(entry),
      })
    } catch (error) {
      await runCleanup(cleanup, manifest.id)
      for (const name of commandNames) this.commands.delete(name)
      for (const name of toolNames) this.tools.delete(name)
      this.unregisterToolRenderers(toolRendererIds)
      for (const id of appViewIds) this.appViews.delete(id)
      for (const id of appSidebarViewIds) this.appSidebarViews.delete(id)
      for (const id of toolbarItemIds) this.sessionToolbarItems.delete(id)
      for (const id of panelIds) this.sessionPanels.delete(id)
      for (const id of treeViewIds) this.sessionTreeViews.delete(id)
      for (const id of mainViewIds) this.sessionMainViews.delete(id)
      this.statuses.set(manifest.id, {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        source: entry.source,
        sourceId: entry.sourceId,
        packageName: configEntry.packageName ?? undefined,
        entryPath: configEntry.entryPath ?? undefined,
        projectPath: configEntry.projectPath ?? undefined,
        enabled: true,
        state: 'error',
        manifest,
        commands: [],
        tools: [],
        diagnostics: [diagnostic('error', `Failed to activate plugin: ${normalizeError(error)}`)],
        permissions: permissionStatuses,
        settings,
        loadTimeMs: Date.now() - startedAt,
        ...metadataFor(entry),
      })
    }
  }

  private async disposeAll() {
    const active = Array.from(this.activePlugins.values())
    this.activePlugins.clear()
    for (const plugin of active.reverse()) {
      try {
        await runCleanup(plugin.cleanup, plugin.manifest.id)
        await plugin.disposable?.dispose()
        await plugin.deactivate?.()
      } catch (error) {
        console.warn(`[PSM plugins] Failed to dispose ${plugin.manifest.id}:`, error)
      }
    }
  }
}

export const psmPluginHost = new PsmPluginHost()

let initialized = false
let initializePromise: Promise<PsmPluginStatus[]> | null = null

export function initializePsmPluginHost(): Promise<PsmPluginStatus[]> {
  if (initialized) return Promise.resolve(psmPluginHost.listPlugins())
  if (initializePromise) return initializePromise

  initializePromise = psmPluginHost.reload()
    .then((plugins) => {
      initialized = true
      return plugins
    })
    .catch((error) => {
      initializePromise = null
      throw error
    })

  return initializePromise
}
