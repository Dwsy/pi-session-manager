import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/transport', () => ({
  invoke: vi.fn().mockResolvedValue([]),
  isTauri: () => false,
}))

import { toolRenderRegistry } from '@/plugins/tools-render/registry'
import { builtinPsmPluginEntries } from '../builtins'
import { PsmPluginHost } from '../host'
import type { PsmPluginLoadEntry, PsmPluginsConfig } from '../types'

function config(plugins: PsmPluginsConfig['plugins'] = {}): PsmPluginsConfig {
  return { version: 1, plugins }
}

afterEach(() => {
  toolRenderRegistry.unregister('test-renderer')
  toolRenderRegistry.unregister('shared-renderer')
})

function entry(id: string, activate = true): PsmPluginLoadEntry {
  return {
    source: 'builtin',
    sourceId: `extensions/${id}`,
    async load() {
      return {
        manifest: {
          manifestVersion: 1,
          id,
          name: id,
          version: '1.0.0',
          permissions: ['records:read'],
        },
        activate: activate
          ? (ctx: any) => {
              ctx.registerCommand(`${id}.command`, async () => ({ ok: true, id }))
              ctx.registerTool(`${id}_tool`, {
                description: 'test tool',
                run: async () => ({ ok: true, id }),
              })
            }
          : undefined,
      }
    },
  }
}

describe('PsmPluginHost', () => {
  it('loads tool renderers as default builtin plugin entries', () => {
    const sourceIds = builtinPsmPluginEntries.map((entry) => entry.sourceId)

    expect(sourceIds).toContain('extensions/psm-ask-user-question-renderer')
    expect(sourceIds).toContain('extensions/psm-loop-renderer')
    expect(sourceIds).toContain('extensions/psm-subagent-renderer')
    expect(sourceIds).toContain('extensions/psm-session-graph')
  })

  it('activates enabled plugins and exposes commands/tools', async () => {
    const host = new PsmPluginHost({
      builtinEntries: [entry('builtin.test')],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
      },
    })

    const plugins = await host.reload()

    expect(plugins[0]).toMatchObject({
      id: 'builtin.test',
      state: 'active',
      enabled: true,
      commands: ['builtin.test.command'],
      tools: ['builtin.test_tool'],
    })
    expect(await host.executeCommand('builtin.test.command')).toEqual({ ok: true, id: 'builtin.test' })
    expect(await host.runTool('builtin.test_tool')).toEqual({ ok: true, id: 'builtin.test' })
  })

  it('keeps disabled built-ins discovered without activating contributions', async () => {
    const host = new PsmPluginHost({
      builtinEntries: [entry('builtin.disabled')],
      services: {
        loadConfig: async () => config({
          'builtin.disabled': { enabled: false, source: 'builtin' },
        }),
        listNpmEntries: async () => [],
      },
    })

    const plugins = await host.reload()

    expect(plugins[0]).toMatchObject({
      id: 'builtin.disabled',
      state: 'disabled',
      enabled: false,
      commands: [],
      tools: [],
    })
    expect(host.getCommandNames()).toEqual([])
    expect(host.getToolNames()).toEqual([])
  })

  it('records invalid plugin modules as diagnostics', async () => {
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/bad',
          async load() {
            return { manifest: { id: '', name: 'Bad', version: '1.0.0' } }
          },
        },
      ],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
      },
    })

    const plugins = await host.reload()

    expect(plugins[0].state).toBe('error')
    expect(plugins[0].diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toContain('id is required')
  })

  it('keeps command/tool conflicts as warning diagnostics without failing activation', async () => {
    function conflictingEntry(id: string): PsmPluginLoadEntry {
      return {
        source: 'builtin',
        sourceId: `extensions/${id}`,
        async load() {
          return {
            manifest: {
              manifestVersion: 1,
              id,
              name: id,
              version: '1.0.0',
            },
            activate: (ctx: any) => {
              ctx.registerCommand('shared.command', async () => ({ id }))
              ctx.registerTool('shared_tool', {
                description: 'shared',
                run: async () => ({ id }),
              })
            },
          }
        },
      }
    }

    const host = new PsmPluginHost({
      builtinEntries: [conflictingEntry('builtin.first'), conflictingEntry('builtin.second')],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
      },
    })

    const plugins = await host.reload()
    const second = plugins.find((plugin) => plugin.id === 'builtin.second')

    expect(second).toMatchObject({
      state: 'active',
      diagnostics: [
        { level: 'warn', message: 'Command already registered: shared.command' },
        { level: 'warn', message: 'Tool already registered: shared_tool' },
      ],
    })
  })

  it('passes plugin settings defaults and saved values into activation context and status', async () => {
    let seenSettings: Record<string, unknown> = {}
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/settings-test',
          async load() {
            return {
              manifest: {
                manifestVersion: 1,
                id: 'builtin.settings-test',
                name: 'Settings Test',
                version: '1.0.0',
                configuration: {
                  title: 'Settings Test',
                  properties: [
                    { key: 'thinkingLevel', title: 'Thinking level', type: 'select', default: 'medium' },
                    { key: 'limit', title: 'Limit', type: 'number', default: 8 },
                  ],
                },
              },
              activate: (ctx: any) => {
                seenSettings = ctx.settings.all()
              },
            }
          },
        },
      ],
      services: {
        loadConfig: async () => config({
          'builtin.settings-test': {
            enabled: true,
            source: 'builtin',
            settings: { limit: 12 },
          },
        }),
        listNpmEntries: async () => [],
      },
    })

    const plugins = await host.reload()

    expect(seenSettings).toEqual({ thinkingLevel: 'medium', limit: 12 })
    expect(plugins[0].settings).toEqual({ thinkingLevel: 'medium', limit: 12 })
  })

  it('merges plugin i18n resources and exposes injected t function', async () => {
    let translated = ''
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/i18n-test',
          async load() {
            return {
              manifest: {
                manifestVersion: 1,
                id: 'builtin.i18n-test',
                name: 'I18n Test',
                version: '1.0.0',
                i18n: {
                  'en-US': { pluginTest: { hello: 'Hello from plugin' } },
                },
              },
              activate: (ctx: any) => {
                translated = ctx.i18n.t('pluginTest.hello', 'Fallback')
              },
            }
          },
        },
      ],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
      },
    })

    await host.reload()

    expect(translated).toBe('Hello from plugin')
  })

  it('registers session UI contributions and warns on duplicate UI ids', async () => {
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/ui-first',
          async load() {
            return {
              manifest: { manifestVersion: 1, id: 'builtin.ui.first', name: 'UI First', version: '1.0.0' },
              activate: (ctx: any) => {
                ctx.ui.registerSessionToolbarItem({ id: 'session.ask', title: 'Ask', render: () => 'ask' })
                ctx.ui.registerSessionPanel({ id: 'session.ask.panel', title: 'Ask Panel', render: () => 'panel' })
              },
            }
          },
        },
        {
          source: 'builtin',
          sourceId: 'extensions/ui-second',
          async load() {
            return {
              manifest: { manifestVersion: 1, id: 'builtin.ui.second', name: 'UI Second', version: '1.0.0' },
              activate: (ctx: any) => {
                ctx.ui.registerSessionToolbarItem({ id: 'session.ask', title: 'Ask Duplicate', render: () => 'duplicate' })
                ctx.ui.registerSessionPanel({ id: 'session.ask.panel', title: 'Ask Panel Duplicate', render: () => 'duplicate' })
              },
            }
          },
        },
      ],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
      },
    })

    const plugins = await host.reload()
    const second = plugins.find((plugin) => plugin.id === 'builtin.ui.second')

    expect(host.listSessionToolbarItems()).toHaveLength(1)
    expect(host.listSessionPanels()).toHaveLength(1)
    expect(second).toMatchObject({
      state: 'active',
      diagnostics: [
        { level: 'warn', message: 'Session toolbar item already registered: session.ask' },
        { level: 'warn', message: 'Session panel already registered: session.ask.panel' },
      ],
    })
  })

  it('registers tool renderers and removes them on reload', async () => {
    let includeRenderer = true
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/tool-renderer',
          async load() {
            return {
              manifest: { manifestVersion: 1, id: 'builtin.tool-renderer', name: 'Tool Renderer', version: '1.0.0' },
              activate: (ctx: any) => {
                if (!includeRenderer) return
                ctx.ui.registerToolRenderer({
                  id: 'test-renderer',
                  name: 'Test Renderer',
                  match: 'custom_tool',
                  component: () => null,
                })
              },
            }
          },
        },
      ],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
      },
    })

    const plugins = await host.reload()

    expect(plugins[0].toolRenderers).toEqual(['test-renderer'])
    expect(host.getToolRendererIds()).toEqual(['test-renderer'])
    expect(toolRenderRegistry.get('test-renderer')).toBeTruthy()

    includeRenderer = false
    await host.reload()

    expect(host.getToolRendererIds()).toEqual([])
    expect(toolRenderRegistry.get('test-renderer')).toBeUndefined()
  })

  it('keeps tool renderer conflicts as warning diagnostics', async () => {
    function rendererEntry(id: string): PsmPluginLoadEntry {
      return {
        source: 'builtin',
        sourceId: `extensions/${id}`,
        async load() {
          return {
            manifest: { manifestVersion: 1, id, name: id, version: '1.0.0' },
            activate: (ctx: any) => {
              ctx.ui.registerToolRenderer({
                id: 'shared-renderer',
                name: 'Shared Renderer',
                match: 'shared_tool',
                component: () => null,
              })
            },
          }
        },
      }
    }

    const host = new PsmPluginHost({
      builtinEntries: [rendererEntry('builtin.renderer.first'), rendererEntry('builtin.renderer.second')],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
      },
    })

    const plugins = await host.reload()
    const second = plugins.find((plugin) => plugin.id === 'builtin.renderer.second')

    expect(second).toMatchObject({
      state: 'active',
      diagnostics: [
        { level: 'warn', message: 'Tool renderer already registered: shared-renderer' },
      ],
    })
  })

  it('records UI render failures as warning diagnostics without marking the plugin error', async () => {
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/ui-render-error',
          async load() {
            return {
              manifest: { manifestVersion: 1, id: 'builtin.ui.render-error', name: 'UI Render Error', version: '1.0.0' },
              activate: (ctx: any) => {
                ctx.ui.registerSessionToolbarItem({ id: 'session.render-error', title: 'Bad UI', render: () => 'bad' })
              },
            }
          },
        },
      ],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
      },
    })

    await host.reload()
    host.recordUiRenderError('builtin.ui.render-error', 'session.render-error', new Error('boom'))
    const status = host.listPlugins()[0]

    expect(status.state).toBe('active')
    expect(status.diagnostics).toContainEqual({
      level: 'warn',
      message: 'UI contribution failed to render (session.render-error): boom',
    })
  })

  it('notifies subscribers with fresh session UI contribution snapshots after reload', async () => {
    let includeUi = false
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/ui-dynamic',
          async load() {
            return {
              manifest: { manifestVersion: 1, id: 'builtin.ui.dynamic', name: 'UI Dynamic', version: '1.0.0' },
              activate: (ctx: any) => {
                if (!includeUi) return
                ctx.ui.registerSessionToolbarItem({ id: 'session.dynamic', title: 'Dynamic', render: () => 'dynamic' })
                ctx.ui.registerSessionPanel({ id: 'session.dynamic.panel', title: 'Dynamic Panel', render: () => 'panel' })
              },
            }
          },
        },
      ],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
      },
    })
    const snapshots: Array<{ toolbarItems: number; panels: number; treeViews: number }> = []
    const unsubscribe = host.subscribe(() => {
      const snapshot = host.getSessionUiSnapshot()
      snapshots.push({
        toolbarItems: snapshot.toolbarItems.length,
        panels: snapshot.panels.length,
        treeViews: snapshot.treeViews.length,
      })
    })

    await host.reload()
    includeUi = true
    await host.reload()
    unsubscribe()

    expect(snapshots).toEqual([
      { toolbarItems: 0, panels: 0, treeViews: 0 },
      { toolbarItems: 1, panels: 1, treeViews: 0 },
    ])
  })

  it('registers session tree view contributions in the UI snapshot', async () => {
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/tree-view',
          async load() {
            return {
              manifest: { manifestVersion: 1, id: 'builtin.tree.view', name: 'Tree View', version: '1.0.0' },
              activate: (ctx: any) => {
                ctx.ui.registerSessionTreeView({
                  id: 'builtin.tree.flow',
                  title: 'Flow',
                  icon: 'Network',
                  render: () => 'flow',
                })
              },
            }
          },
        },
      ],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
      },
    })

    await host.reload()

    expect(host.getSessionUiSnapshot().treeViews).toMatchObject([
      {
        id: 'builtin.tree.flow',
        title: 'Flow',
        icon: 'Network',
        pluginId: 'builtin.tree.view',
      },
    ])
  })

  it('registers session main view contributions in the UI snapshot', async () => {
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/trace',
          async load() {
            return {
              manifest: { manifestVersion: 1, id: 'builtin.trace', name: 'Trace', version: '1.0.0' },
              activate: (ctx: any) => {
                ctx.ui.registerSessionToolbarItem({
                  id: 'builtin.trace.toolbar',
                  title: 'Trace',
                  mainViewId: 'builtin.trace.main',
                  render: () => 'trace-button',
                })
                ctx.ui.registerSessionMainView({
                  id: 'builtin.trace.main',
                  title: 'Trace',
                  render: () => 'trace',
                })
              },
            }
          },
        },
      ],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
      },
    })

    await host.reload()

    expect(host.getSessionUiSnapshot().toolbarItems).toMatchObject([
      {
        id: 'builtin.trace.toolbar',
        mainViewId: 'builtin.trace.main',
        pluginId: 'builtin.trace',
      },
    ])
    expect(host.getSessionUiSnapshot().mainViews).toMatchObject([
      {
        id: 'builtin.trace.main',
        title: 'Trace',
        pluginId: 'builtin.trace',
      },
    ])
  })

  it('loads path entries through module source bundles', async () => {
    const source = `
      export const manifest = {
        manifestVersion: 1,
        id: 'path.test',
        name: 'Path Test',
        version: '1.0.0',
        permissions: ['records:read']
      };
      export function activate(ctx) {
        ctx.registerCommand('path.test.command', async () => 'ok');
      }
    `
    const host = new PsmPluginHost({
      builtinEntries: [],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
        listPathEntries: async () => [
          {
            entryPath: '/tmp/local-plugin.mjs',
          },
        ],
        readPathModuleSource: async () => source,
      },
    })

    const plugins = await host.reload()

    expect(plugins[0]).toMatchObject({
      id: 'path.test',
      source: 'path',
      sourceId: '/tmp/local-plugin.mjs',
      commands: ['path.test.command'],
    })
    expect(await host.executeCommand('path.test.command')).toBe('ok')
  })

  it('loads npm entries through module source bundles', async () => {
    const source = `
      export const manifest = {
        manifestVersion: 1,
        id: 'npm.test',
        name: 'NPM Test',
        version: '1.0.0',
        package: { name: '@acme/npm-test', export: './dist/index.js' },
        permissions: ['records:read']
      };
      export function activate(ctx) {
        ctx.registerCommand('npm.test.command', async () => 'ok');
      }
    `
    const host = new PsmPluginHost({
      builtinEntries: [],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [
          {
            packageName: '@acme/npm-test',
            packageVersion: '1.0.0',
            entryPath: '/tmp/npm-test/dist/index.js',
            exportPath: './dist/index.js',
          },
        ],
        readNpmModuleSource: async () => source,
      },
    })

    const plugins = await host.reload()

    expect(plugins[0]).toMatchObject({
      id: 'npm.test',
      source: 'npm',
      packageName: '@acme/npm-test',
      commands: ['npm.test.command'],
    })
    expect(await host.executeCommand('npm.test.command')).toBe('ok')
  })
})
