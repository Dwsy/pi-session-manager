import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/transport', () => ({
  invoke: vi.fn(async (command: string) => {
    if (command === 'load_pi_settings_full') return { defaultProvider: 'openai', defaultModel: 'gpt-5.5' }
    if (command === 'list_model_options_fast') return [{ provider: 'openai', model: 'gpt-5.5' }]
    if (command === 'invoke_model_text') return { text: 'ok', provider: 'openai', model: 'gpt-5.5' }
    return []
  }),
  isTauri: () => false,
}))

import { invoke as appInvoke } from '@/transport'
import { toolRenderRegistry } from '@/plugins/tools-render/registry'
import { psmPluginPermissionRequests } from '../permissionRequests'
import { psmRuntimeEventBus } from '../eventBus'
import { builtinPsmPluginEntries } from '../builtins'
import { PsmPluginHost } from '../host'
import type { PsmPluginLoadEntry, PsmPluginsConfig } from '../types'

function config(plugins: PsmPluginsConfig['plugins'] = {}): PsmPluginsConfig {
  return { version: 1, plugins }
}

afterEach(() => {
  toolRenderRegistry.unregister('test-renderer')
  toolRenderRegistry.unregister('shared-renderer')
  psmRuntimeEventBus.clear()
  psmPluginPermissionRequests.reset()
  vi.mocked(appInvoke).mockReset()
  vi.mocked(appInvoke).mockImplementation(async (command: string) => {
    if (command === 'load_pi_settings_full') return { defaultProvider: 'openai', defaultModel: 'gpt-5.5' }
    if (command === 'list_model_options_fast') return [{ provider: 'openai', model: 'gpt-5.5' }]
    if (command === 'invoke_model_text') return { text: 'ok', provider: 'openai', model: 'gpt-5.5' }
    return []
  })
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
    expect(sourceIds).toContain('extensions/psm-cross-agent-tool-renderer')
    expect(sourceIds).toContain('extensions/psm-generative-ui-renderer')
    expect(sourceIds).toContain('extensions/psm-session-graph')
    expect(sourceIds).not.toContain('extensions/psm-word-cloud')
  })

  it('applies permission overrides before injecting ctx.psm permissions', async () => {
    let injectedPermissions: string[] = []
    const host = new PsmPluginHost({
      builtinEntries: [{
        source: 'builtin',
        sourceId: 'extensions/permissioned',
        async load() {
          return {
            manifest: {
              manifestVersion: 1,
              id: 'permissioned',
              name: 'permissioned',
              version: '1.0.0',
              permissions: ['sessions:read', 'agent:invoke'],
            },
            activate(ctx: any) {
              injectedPermissions = ctx.permissions.permissions
            },
          }
        },
      }],
      services: {
        loadConfig: async () => config({
          permissioned: {
            enabled: true,
            permissionOverrides: { 'agent:invoke': false },
          },
        }),
        listNpmEntries: async () => [],
      },
    })

    const plugins = await host.reload()

    expect(injectedPermissions).toEqual(['sessions:read'])
    expect(plugins[0].permissions).toEqual([
      { permission: 'sessions:read', granted: true },
      { permission: 'agent:invoke', granted: false },
    ])
  })

  it('requests revoked fs permission, persists the grant, and retries local file reads', async () => {
    const requestPermission = vi.fn(async () => true)
    const setPluginPermissions = vi.fn(async () => config())
    const host = new PsmPluginHost({
      builtinEntries: [{
        source: 'builtin',
        sourceId: 'extensions/local-file-plugin',
        async load() {
          return {
            manifest: {
              manifestVersion: 1,
              id: 'local-file-plugin',
              name: 'Local File Plugin',
              version: '1.0.0',
              permissions: ['fs:read'],
            },
            activate(ctx: any) {
              ctx.registerCommand('local-file.read', async () => ctx.psm.fs.read('widgets', 'widget.html'))
            },
          }
        },
      }],
      services: {
        loadConfig: async () => config({
          'local-file-plugin': {
            enabled: true,
            source: 'builtin',
            permissionOverrides: { 'fs:read': false },
          },
        }),
        listNpmEntries: async () => [],
        listPathEntries: async () => [],
        listDevEntries: async () => [],
        setPluginPermissions,
        requestPermission,
      },
    })

    await host.reload()
    vi.mocked(appInvoke).mockResolvedValueOnce({
      rootId: 'widgets',
      path: 'widget.html',
      content: '<div>Widget</div>',
      encoding: 'utf-8',
      bytes: 17,
    })

    await expect(host.executeCommand('local-file.read')).resolves.toMatchObject({ content: '<div>Widget</div>' })
    expect(requestPermission).toHaveBeenCalledWith({
      pluginId: 'local-file-plugin',
      pluginName: 'Local File Plugin',
      permission: 'fs:read',
    })
    expect(setPluginPermissions).toHaveBeenCalledWith({
      pluginId: 'local-file-plugin',
      permissionOverrides: { 'fs:read': true },
      source: 'builtin',
      packageName: null,
      entryPath: null,
      projectPath: null,
    })
    expect(appInvoke).toHaveBeenCalledWith('plugin_fs_read', {
      rootId: 'widgets',
      path: 'widget.html',
      encoding: undefined,
      maxBytes: undefined,
      __psm: {
        pluginId: 'local-file-plugin',
        permissions: ['fs:read'],
      },
    })
  })

  it('does not call local file transport when fs permission request is denied', async () => {
    const requestPermission = vi.fn(async () => false)
    const host = new PsmPluginHost({
      builtinEntries: [{
        source: 'builtin',
        sourceId: 'extensions/local-file-denied',
        async load() {
          return {
            manifest: {
              manifestVersion: 1,
              id: 'local-file-denied',
              name: 'Local File Denied',
              version: '1.0.0',
              permissions: ['fs:read'],
            },
            activate(ctx: any) {
              ctx.registerCommand('local-file.denied', async () => ctx.psm.fs.read('widgets', 'widget.html'))
            },
          }
        },
      }],
      services: {
        loadConfig: async () => config({
          'local-file-denied': {
            enabled: true,
            permissionOverrides: { 'fs:read': false },
          },
        }),
        listNpmEntries: async () => [],
        listPathEntries: async () => [],
        listDevEntries: async () => [],
        requestPermission,
      },
    })

    await host.reload()

    await expect(host.executeCommand('local-file.denied')).rejects.toThrow('missing fs:read')
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(appInvoke).not.toHaveBeenCalledWith('plugin_fs_read', expect.anything())
  })

  it('rejects undeclared fs reads without prompting', async () => {
    const requestPermission = vi.fn(async () => true)
    const host = new PsmPluginHost({
      builtinEntries: [{
        source: 'builtin',
        sourceId: 'extensions/local-file-undeclared',
        async load() {
          return {
            manifest: {
              manifestVersion: 1,
              id: 'local-file-undeclared',
              name: 'Local File Undeclared',
              version: '1.0.0',
              permissions: [],
            },
            activate(ctx: any) {
              ctx.registerCommand('local-file.undeclared', async () => ctx.psm.fs.read('widgets', 'widget.html'))
            },
          }
        },
      }],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
        listPathEntries: async () => [],
        listDevEntries: async () => [],
        requestPermission,
      },
    })

    await host.reload()

    await expect(host.executeCommand('local-file.undeclared')).rejects.toThrow('did not declare fs:read')
    expect(requestPermission).not.toHaveBeenCalled()
    expect(appInvoke).not.toHaveBeenCalledWith('plugin_fs_read', expect.anything())
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

  it('injects host agent bridge into plugin capabilities', async () => {
    const createSession = vi.fn(async () => ({ sessionId: 'agent-1', storageScope: 'plugin' }))
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/agent-plugin',
          async load() {
            return {
              manifest: {
                manifestVersion: 1,
                id: 'builtin.agent-plugin',
                name: 'Agent Plugin',
                version: '1.0.0',
                permissions: ['agent:invoke', 'model:invoke'],
              },
              activate: (ctx: any) => {
                ctx.registerCommand('agent.create', async () => ctx.psm.agent.createSession({
                  purpose: 'semantic-search',
                  tools: [],
                  storage: { scope: 'plugin' },
                }))
              },
            }
          },
        },
      ],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
        createAgentBridge: () => ({
          createSession,
          run: async () => ({ sessionId: 'agent-1', text: 'ok' }),
          runStream: async () => ({ sessionId: 'agent-1', text: 'ok' }),
          abort: async () => {},
          dispose: async () => {},
        }),
      },
    })

    await host.reload()

    await expect(host.executeCommand('agent.create')).resolves.toEqual({ sessionId: 'agent-1', storageScope: 'plugin' })
    expect(createSession).toHaveBeenCalledWith({
      purpose: 'semantic-search',
      tools: [],
      storage: { scope: 'plugin' },
    })
  })

  it('injects the default Pi Agent bridge when no service override is provided', async () => {
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/default-agent-plugin',
          async load() {
            return {
              manifest: {
                manifestVersion: 1,
                id: 'builtin.default-agent-plugin',
                name: 'Default Agent Plugin',
                version: '1.0.0',
                permissions: ['agent:invoke', 'model:invoke'],
              },
              activate: (ctx: any) => {
                ctx.registerCommand('agent.default.create', async () => ctx.psm.agent.createSession({
                  purpose: 'semantic-search',
                  model: { provider: 'openai', id: 'gpt-5.5' },
                  tools: [],
                  storage: { scope: 'plugin' },
                }))
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

    await expect(host.executeCommand('agent.default.create')).resolves.toMatchObject({
      storageScope: 'plugin',
      model: { provider: 'openai', id: 'gpt-5.5' },
    })
  })

  it('returns a cached command snapshot between reload notifications', async () => {
    const host = new PsmPluginHost({
      builtinEntries: [entry('builtin.test')],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
      },
    })

    const initialSnapshot = host.listCommands()
    expect(host.listCommands()).toBe(initialSnapshot)

    await host.reload()

    const loadedSnapshot = host.listCommands()
    expect(loadedSnapshot).toMatchObject([{ id: 'builtin.test.command' }])
    expect(host.listCommands()).toBe(loadedSnapshot)
  })

  it('subscribes plugin event listeners and tears them down on reload', async () => {
    let subscribeEvents = true
    const handler = vi.fn()
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/event-listener',
          async load() {
            return {
              manifest: {
                manifestVersion: 1,
                id: 'builtin.event-listener',
                name: 'Event Listener',
                version: '1.0.0',
                permissions: ['events:read'],
              },
              activate: (ctx: any) => {
                if (!subscribeEvents) return
                ctx.events.subscribe('pi-live:session_registered', handler)
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
    psmRuntimeEventBus.emit('pi-live:session_registered', { sessionId: 'session-1' })
    expect(handler).toHaveBeenCalledWith({
      name: 'pi-live:session_registered',
      payload: { sessionId: 'session-1' },
    })

    subscribeEvents = false
    await host.reload()
    psmRuntimeEventBus.emit('pi-live:session_registered', { sessionId: 'session-2' })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('rejects event subscriptions without events:read permission', async () => {
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/event-denied',
          async load() {
            return {
              manifest: {
                manifestVersion: 1,
                id: 'builtin.event-denied',
                name: 'Event Denied',
                version: '1.0.0',
              },
              activate: (ctx: any) => {
                ctx.events.subscribe('pi-live:session_registered', vi.fn())
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

    expect(plugins[0]).toMatchObject({
      id: 'builtin.event-denied',
      state: 'error',
      diagnostics: [
        {
          level: 'error',
          message: 'Failed to activate plugin: Plugin builtin.event-denied must declare events:read to subscribe to pi-live:session_registered',
        },
      ],
    })
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

  it('exposes a plugin logger that prefixes console output', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/logger-test',
          async load() {
            return {
              manifest: { manifestVersion: 1, id: 'builtin.logger-test', name: 'Logger Test', version: '1.0.0' },
              activate: (ctx: any) => {
                ctx.log.info('hello', { value: 1 })
                ctx.log.warn('careful')
                ctx.log.error('boom', { reason: 'test' })
                ctx.log.debug('trace')
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

    expect(infoSpy).toHaveBeenCalledWith('[PSM plugins:builtin.logger-test] hello', { value: 1 })
    expect(warnSpy).toHaveBeenCalledWith('[PSM plugins:builtin.logger-test] careful', undefined)
    expect(errorSpy).toHaveBeenCalledWith('[PSM plugins:builtin.logger-test] boom', { reason: 'test' })
    expect(debugSpy).toHaveBeenCalledWith('[PSM plugins:builtin.logger-test] trace', undefined)

    infoSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
    debugSpy.mockRestore()
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
                ctx.ui.registerAppView({ id: 'app.notes', title: 'Notes', route: '/notes', render: () => 'notes' })
                ctx.ui.registerAppSidebarView({ id: 'app.notes.sidebar', title: 'Notes Sidebar', appViewId: 'app.notes', route: '/notes', render: () => 'sidebar' })
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
                ctx.ui.registerAppView({ id: 'app.notes', title: 'Notes Duplicate', route: '/notes', render: () => 'duplicate' })
                ctx.ui.registerAppSidebarView({ id: 'app.notes.sidebar', title: 'Notes Sidebar Duplicate', appViewId: 'app.notes', route: '/notes', render: () => 'duplicate' })
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
    expect(host.listAppViews()).toHaveLength(1)
    expect(host.listAppSidebarViews()).toHaveLength(1)
    expect(second).toMatchObject({
      state: 'active',
      diagnostics: [
        { level: 'warn', message: 'App view already registered: app.notes' },
        { level: 'warn', message: 'App sidebar view already registered: app.notes.sidebar' },
        { level: 'warn', message: 'Session toolbar item already registered: session.ask' },
        { level: 'warn', message: 'Session panel already registered: session.ask.panel' },
      ],
    })
  })

  it('keeps session panel side metadata for right and bottom panels', async () => {
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/panels',
          async load() {
            return {
              manifest: { manifestVersion: 1, id: 'builtin.panels', name: 'Panels', version: '1.0.0' },
              activate: (ctx: any) => {
                ctx.ui.registerSessionPanel({ id: 'session.right.panel', title: 'Right', render: () => 'right' })
                ctx.ui.registerSessionPanel({ id: 'session.bottom.panel', title: 'Bottom', side: 'bottom', render: () => 'bottom' })
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

    expect(host.getSessionUiSnapshot().panels).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'session.right.panel', side: 'right', pluginId: 'builtin.panels' }),
      expect.objectContaining({ id: 'session.bottom.panel', side: 'bottom', pluginId: 'builtin.panels' }),
    ]))
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

  it('registers app view contributions in the UI snapshot', async () => {
    const host = new PsmPluginHost({
      builtinEntries: [
        {
          source: 'builtin',
          sourceId: 'extensions/notes',
          async load() {
            return {
              manifest: { manifestVersion: 1, id: 'builtin.notes', name: 'Notes', version: '1.0.0' },
              activate: (ctx: any) => {
                ctx.ui.registerAppView({
                  id: 'builtin.notes.view',
                  title: 'Notes',
                  route: '/notes',
                  icon: 'notebook',
                  shortcut: 'Cmd+Shift+N',
                  render: () => 'notes',
                })
                ctx.ui.registerAppSidebarView({
                  id: 'builtin.notes.sidebar',
                  title: 'Notes Sidebar',
                  appViewId: 'builtin.notes.view',
                  route: '/notes',
                  render: () => 'sidebar',
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

    expect(host.getSessionUiSnapshot()).toMatchObject({
      ready: true,
      appViews: [
        {
          id: 'builtin.notes.view',
          title: 'Notes',
          route: '/notes',
          icon: 'notebook',
          shortcut: 'Cmd+Shift+N',
          pluginId: 'builtin.notes',
        },
      ],
      appSidebarViews: [
        {
          id: 'builtin.notes.sidebar',
          title: 'Notes Sidebar',
          appViewId: 'builtin.notes.view',
          route: '/notes',
          pluginId: 'builtin.notes',
        },
      ],
    })
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

  it('loads dev entries through module source bundles', async () => {
    const source = `
      export const manifest = {
        manifestVersion: 1,
        id: 'dev.test',
        name: 'Dev Test',
        version: '1.0.0',
        permissions: ['records:read']
      };
      export function activate(ctx) {
        ctx.registerCommand('dev.test.command', async () => 'ok');
      }
    `
    const host = new PsmPluginHost({
      builtinEntries: [],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
        listPathEntries: async () => [],
        listDevEntries: async () => [
          {
            projectPath: '/tmp/dev-plugin',
            packageName: '@acme/dev-plugin',
            packageVersion: '0.1.0',
            entryPath: '/tmp/dev-plugin/dist/index.js',
            exportPath: './dist/index.js',
          },
        ],
        readDevModuleSource: async () => source,
      },
    })

    const plugins = await host.reload()

    expect(plugins[0]).toMatchObject({
      id: 'dev.test',
      source: 'dev',
      sourceId: '/tmp/dev-plugin/dist/index.js',
      packageName: '@acme/dev-plugin',
      projectPath: '/tmp/dev-plugin',
      commands: ['dev.test.command'],
    })
    expect(await host.executeCommand('dev.test.command')).toBe('ok')
  })

  it('loads built word-cloud dev plugin module source', async () => {
    ;(globalThis as Record<string, unknown>).__PSM_HOST_REACT__ = await import('react')
    const source = readFileSync(new URL('../../../../extensions/psm-word-cloud/dist/index.mjs', import.meta.url), 'utf8')
    const host = new PsmPluginHost({
      builtinEntries: [],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
        listPathEntries: async () => [],
        listDevEntries: async () => [
          {
            projectPath: '/Users/dengwenyu/Dev/AI/pi-session-manager/extensions/psm-word-cloud',
            packageName: '@local/psm-word-cloud',
            packageVersion: '0.1.0',
            entryPath: '/Users/dengwenyu/Dev/AI/pi-session-manager/extensions/psm-word-cloud/dist/index.mjs',
            exportPath: './dist/index.mjs',
          },
        ],
        readDevModuleSource: async () => source,
      },
    })

    const plugins = await host.reload()

    expect(plugins[0]).toMatchObject({
      id: 'builtin.word-cloud',
      source: 'dev',
      packageName: '@local/psm-word-cloud',
      state: 'active',
      appViews: ['builtin.word-cloud.view'],
    })
  })

  it('reports duplicate plugin ids without replacing the first loaded plugin', async () => {
    const duplicateSource = `
      export const manifest = {
        manifestVersion: 1,
        id: 'builtin.test',
        name: 'Duplicate Dev Test',
        version: '1.0.0'
      };
      export function activate(ctx) {
        ctx.registerCommand('duplicate.command', async () => 'bad');
      }
    `
    const host = new PsmPluginHost({
      builtinEntries: [entry('builtin.test')],
      services: {
        loadConfig: async () => config(),
        listNpmEntries: async () => [],
        listPathEntries: async () => [],
        listDevEntries: async () => [
          {
            projectPath: '/tmp/dev-plugin',
            entryPath: '/tmp/dev-plugin/dist/index.js',
            exportPath: './dist/index.js',
          },
        ],
        readDevModuleSource: async () => duplicateSource,
      },
    })

    const plugins = await host.reload()

    expect(plugins.find((plugin) => plugin.id === 'builtin.test')).toMatchObject({
      state: 'active',
      commands: ['builtin.test.command'],
    })
    expect(plugins.find((plugin) => plugin.id === '/tmp/dev-plugin/dist/index.js')).toMatchObject({
      state: 'error',
      diagnostics: [{ level: 'error', message: expect.stringContaining('Duplicate plugin id builtin.test') }],
    })
    expect(host.getCommandNames()).toEqual(['builtin.test.command'])
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
