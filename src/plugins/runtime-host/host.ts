import {
  assertPsmPluginManifest,
  createPluginCapabilityClient,
  type PsmPluginDisposable,
  type PsmPluginHostContext,
  type PsmPluginI18nClient,
  type PsmPluginManifest,
  type PsmPluginModule,
  type PsmPluginSettingValue,
  type PsmPluginSettingsClient,
  type PsmPluginToolRegistration,
  type PsmToolRendererRegistration,
} from '@pi-session-manager/plugin-sdk'

import i18n from '@/i18n/config'
import { toolRenderRegistry } from '@/plugins/tools-render/registry'
import type { ToolRenderPlugin } from '@/plugins/tools-render/types'

import { appPsmTransport } from './appTransport'

import { builtinPsmPluginEntries } from './builtins'
import {
  listNpmPsmPluginEntries,
  listPathPsmPluginEntries,
  loadPsmPluginConfig,
  readNpmPsmPluginModuleSource,
  readPathPsmPluginModuleSource,
} from './service'
import type {
  PsmPluginCommandHandler,
  PsmPluginConfigEntry,
  PsmPluginDiagnostic,
  PsmPathPluginEntry,
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
  disposable?: PsmPluginDisposable
  deactivate?: () => void | Promise<void>
}

interface PsmPluginHostServices {
  loadConfig(): Promise<PsmPluginsConfig>
  listNpmEntries(): Promise<Array<{
    packageName: string
    packageVersion?: string | null
    entryPath: string
    exportPath: string
    moduleModifiedMs?: number | null
    sourceHash?: string | null
  }>>
  listPathEntries(): Promise<PsmPathPluginEntry[]>
  readNpmModuleSource(entryPath: string): Promise<string>
  readPathModuleSource(entryPath: string): Promise<string>
}

interface PsmPluginHostOptions {
  builtinEntries?: PsmPluginLoadEntry[]
  services?: Partial<PsmPluginHostServices>
}

const defaultServices: PsmPluginHostServices = {
  loadConfig: loadPsmPluginConfig,
  listNpmEntries: listNpmPsmPluginEntries,
  listPathEntries: listPathPsmPluginEntries,
  readNpmModuleSource: readNpmPsmPluginModuleSource,
  readPathModuleSource: readPathPsmPluginModuleSource,
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
): PsmPluginConfigEntry {
  return {
    enabled: pluginEnabled(config, manifest),
    source: config.plugins[manifest.id]?.source ?? source,
    packageName: config.plugins[manifest.id]?.packageName ?? packageName ?? manifest.package?.name ?? null,
    entryPath: config.plugins[manifest.id]?.entryPath ?? entryPath ?? null,
    settings: config.plugins[manifest.id]?.settings ?? {},
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
  moduleModifiedMs?: number | null
  sourceHash?: string | null
  readModuleSource(entryPath: string): Promise<string>
}): PsmPluginLoadEntry {
  return {
    source: options.source,
    sourceId: options.sourceId,
    packageName: options.packageName,
    packageVersion: options.packageVersion,
    entryPath: options.entryPath,
    moduleModifiedMs: options.moduleModifiedMs,
    sourceHash: options.sourceHash,
    async load() {
      const source = await options.readModuleSource(options.entryPath)
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

export class PsmPluginHost {
  private readonly builtinEntries: PsmPluginLoadEntry[]
  private readonly services: PsmPluginHostServices
  private commands = new Map<string, { pluginId: string; handler: PsmPluginCommandHandler }>()
  private tools = new Map<string, PsmPluginToolRuntimeRegistration>()
  private toolRenderers = new Map<string, PsmToolRendererRuntimeRegistration>()
  private sessionToolbarItems = new Map<string, PsmSessionToolbarItemRuntimeRegistration>()
  private sessionPanels = new Map<string, PsmSessionPanelRuntimeRegistration>()
  private sessionTreeViews = new Map<string, PsmSessionTreeViewRuntimeRegistration>()
  private sessionMainViews = new Map<string, PsmSessionMainViewRuntimeRegistration>()
  private sessionUiSnapshot: PsmPluginSessionUiSnapshot = { toolbarItems: [], panels: [], treeViews: [], mainViews: [] }
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

  getToolNames(): string[] {
    return Array.from(this.tools.keys()).sort()
  }

  getToolRendererIds(): string[] {
    return Array.from(this.toolRenderers.keys()).sort()
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
      toolbarItems: this.listSessionToolbarItems(),
      panels: this.listSessionPanels(),
      treeViews: this.listSessionTreeViews(),
      mainViews: this.listSessionMainViews(),
    }
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

  async executeCommand(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const command = this.commands.get(name)
    if (!command) throw new Error(`PSM plugin command not found: ${name}`)
    return command.handler(args)
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
    const entries = [
      ...this.builtinEntries,
      ...npmEntries.map((entry) => npmEntryToLoadEntry(entry, this.services.readNpmModuleSource)),
      ...pathEntries.map((entry) => pathEntryToLoadEntry(entry, this.services.readPathModuleSource)),
    ]

    for (const entry of entries) {
      await this.loadEntry(entry, config)
    }

    return this.listPlugins()
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
      this.statuses.set(entry.sourceId, {
        id: entry.sourceId,
        name: entry.packageName ?? entry.sourceId,
        version: entry.packageVersion ?? undefined,
        source: entry.source,
        sourceId: entry.sourceId,
        packageName: entry.packageName,
        enabled: false,
        state: 'error',
        commands: [],
        tools: [],
        diagnostics: [diagnostic('error', normalizeError(error))],
        loadTimeMs: Date.now() - startedAt,
        ...metadataFor(entry),
      })
      return
    }

    mergePluginI18n(manifest)
    const configEntry = configEntryFor(config, manifest, entry.source, entry.packageName, entry.entryPath)
    const settings = settingsFor(manifest, configEntry)
    if (!configEntry.enabled) {
      this.statuses.set(manifest.id, {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        source: entry.source,
        sourceId: entry.sourceId,
        packageName: configEntry.packageName ?? undefined,
        entryPath: configEntry.entryPath ?? undefined,
        enabled: false,
        state: 'disabled',
        manifest,
        commands: [],
        tools: [],
        diagnostics: [],
        settings,
        loadTimeMs: Date.now() - startedAt,
        ...metadataFor(entry),
      })
      return
    }

    const commandNames: string[] = []
    const toolNames: string[] = []
    const toolRendererIds: string[] = []
    const toolbarItemIds: string[] = []
    const panelIds: string[] = []
    const treeViewIds: string[] = []
    const mainViewIds: string[] = []
    const diagnostics: PsmPluginDiagnostic[] = []
    const permissions = {
      pluginId: manifest.id,
      permissions: manifest.permissions ?? [],
    }

    const context: PsmPluginHostContext = {
      manifest,
      permissions,
      psm: createPluginCapabilityClient({ transport: appPsmTransport, permissions }),
      settings: settingsClient(settings),
      i18n: i18nClient(),
      ui: {
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
      registerCommand: (name, handler) => {
        if (this.commands.has(name)) {
          diagnostics.push(diagnostic('warn', `Command already registered: ${name}`))
          return
        }
        this.commands.set(name, { pluginId: manifest.id, handler })
        commandNames.push(name)
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
        disposable: disposable && typeof disposable === 'object' ? disposable : undefined,
        deactivate: module.deactivate,
      })
      this.statuses.set(manifest.id, {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        source: entry.source,
        sourceId: entry.sourceId,
        packageName: configEntry.packageName ?? undefined,
        entryPath: configEntry.entryPath ?? undefined,
        enabled: true,
        state: 'active',
        manifest,
        commands: commandNames,
        tools: toolNames,
        toolRenderers: toolRendererIds,
        diagnostics,
        settings,
        loadTimeMs: Date.now() - startedAt,
        ...metadataFor(entry),
      })
    } catch (error) {
      for (const name of commandNames) this.commands.delete(name)
      for (const name of toolNames) this.tools.delete(name)
      this.unregisterToolRenderers(toolRendererIds)
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
        enabled: true,
        state: 'error',
        manifest,
        commands: [],
        tools: [],
        diagnostics: [diagnostic('error', `Failed to activate plugin: ${normalizeError(error)}`)],
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
