// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addDevPsmPlugin: vi.fn(),
  addPathPsmPlugin: vi.fn(),
  buildDevPsmPlugin: vi.fn(),
  getPsmPluginPaths: vi.fn(),
  initializePsmPluginHost: vi.fn(),
  installPsmPlugin: vi.fn(),
  listPlugins: vi.fn(),
  reload: vi.fn(),
  subscribe: vi.fn(),
  setPsmPluginEnabled: vi.fn(),
  setPsmPluginSettings: vi.fn(),
  removeDevPsmPlugin: vi.fn(),
  removePathPsmPlugin: vi.fn(),
  searchPsmPluginMarket: vi.fn(),
  uninstallPsmPlugin: vi.fn(),
  updatePsmPlugins: vi.fn(),
  invoke: vi.fn(),
}))

vi.mock('@/plugins/runtime-host', () => ({
  addDevPsmPlugin: mocks.addDevPsmPlugin,
  addPathPsmPlugin: mocks.addPathPsmPlugin,
  buildDevPsmPlugin: mocks.buildDevPsmPlugin,
  getPsmPluginPaths: mocks.getPsmPluginPaths,
  initializePsmPluginHost: mocks.initializePsmPluginHost,
  installPsmPlugin: mocks.installPsmPlugin,
  psmPluginHost: {
    listPlugins: mocks.listPlugins,
    reload: mocks.reload,
    subscribe: mocks.subscribe,
  },
  setPsmPluginEnabled: mocks.setPsmPluginEnabled,
  setPsmPluginSettings: mocks.setPsmPluginSettings,
  searchPsmPluginMarket: mocks.searchPsmPluginMarket,
  removeDevPsmPlugin: mocks.removeDevPsmPlugin,
  removePathPsmPlugin: mocks.removePathPsmPlugin,
  uninstallPsmPlugin: mocks.uninstallPsmPlugin,
  updatePsmPlugins: mocks.updatePsmPlugins,
}))

vi.mock('@/transport', () => ({
  invoke: mocks.invoke,
}))

import PsmPluginsSettings from './PsmPluginsSettings'

const builtinPlugin = {
  id: 'builtin.sidechat',
  name: 'Built-in Sidechat',
  version: '0.1.0',
  source: 'builtin' as const,
  sourceId: 'extensions/psm-sidechat',
  enabled: true,
  state: 'active' as const,
  commands: ['sidechat.ask'],
  tools: [],
  diagnostics: [],
  settings: {
    provider: 'openai',
    model: 'gpt-4o',
    thinkingLevel: 'medium',
    limit: 8,
  },
  manifest: {
    manifestVersion: 1,
    id: 'builtin.sidechat',
    name: 'Built-in Sidechat',
    version: '0.1.0',
    configuration: {
      title: 'Sidechat Settings',
      properties: [
        {
          key: 'provider',
          title: 'Default provider',
          type: 'model-provider',
          default: '',
          modelKey: 'model',
        },
        {
          key: 'model',
          title: 'Default model',
          type: 'model-id',
          default: '',
          providerKey: 'provider',
        },
        {
          key: 'thinkingLevel',
          title: 'Thinking level',
          type: 'select',
          default: 'medium',
          options: [
            { label: 'Medium', value: 'medium' },
            { label: 'High', value: 'high' },
          ],
        },
        { key: 'limit', title: 'Snippet limit', type: 'number', default: 8, min: 1, max: 12 },
      ],
    },
  },
}

const npmPlugin = {
  id: 'npm.sidechat',
  name: 'NPM Sidechat',
  version: '1.0.0',
  source: 'npm' as const,
  sourceId: '/tmp/npm-sidechat/dist/index.js',
  packageName: '@acme/psm-sidechat',
  enabled: true,
  state: 'active' as const,
  commands: [],
  tools: ['sidechat_tool'],
  diagnostics: ['x'.repeat(180)],
}

const installedPlugin = {
  ...npmPlugin,
  id: 'npm.new-plugin',
  name: 'New Plugin',
  packageName: '@acme/new-plugin',
}

const pathPlugin = {
  id: 'path.local',
  name: 'Path Local',
  version: '0.1.0',
  source: 'path' as const,
  sourceId: '/Users/test/plugins/local-plugin.mjs',
  entryPath: '/Users/test/plugins/local-plugin.mjs',
  enabled: true,
  state: 'active' as const,
  commands: ['path.local.command'],
  tools: [],
  diagnostics: [],
}

const devPlugin = {
  id: 'dev.local',
  name: 'Dev Local',
  version: '0.1.0',
  source: 'dev' as const,
  sourceId: '/Users/test/plugins/dev-plugin/dist/index.js',
  packageName: '@acme/dev-plugin',
  entryPath: '/Users/test/plugins/dev-plugin/dist/index.js',
  projectPath: '/Users/test/plugins/dev-plugin',
  enabled: true,
  state: 'active' as const,
  commands: ['dev.local.command'],
  tools: [],
  diagnostics: [],
}

describe('PsmPluginsSettings npm lifecycle controls', () => {
  beforeEach(() => {
    mocks.addDevPsmPlugin.mockReset()
    mocks.addPathPsmPlugin.mockReset()
    mocks.buildDevPsmPlugin.mockReset()
    mocks.getPsmPluginPaths.mockReset()
    mocks.initializePsmPluginHost.mockReset()
    mocks.installPsmPlugin.mockReset()
    mocks.listPlugins.mockReset()
    mocks.reload.mockReset()
    mocks.subscribe.mockReset()
    mocks.setPsmPluginEnabled.mockReset()
    mocks.setPsmPluginSettings.mockReset()
    mocks.searchPsmPluginMarket.mockReset()
    mocks.removeDevPsmPlugin.mockReset()
    mocks.removePathPsmPlugin.mockReset()
    mocks.uninstallPsmPlugin.mockReset()
    mocks.updatePsmPlugins.mockReset()
    mocks.invoke.mockReset()

    mocks.getPsmPluginPaths.mockResolvedValue({
      configPath: '/Users/test/.pi/pi-session-manager/plugins.json',
      npmDir: '/Users/test/.pi/pi-session-manager/extensions/npm',
      customPaths: [],
      devProjects: [],
    })
    mocks.addDevPsmPlugin.mockResolvedValue({ version: 1, plugins: {}, devProjects: ['/Users/test/plugins/dev-plugin'] })
    mocks.buildDevPsmPlugin.mockResolvedValue({ entries: [], stdout: '', stderr: '' })
    mocks.initializePsmPluginHost.mockImplementation(() => mocks.reload())
    mocks.listPlugins.mockReturnValue([])
    mocks.subscribe.mockReturnValue(() => {})
    mocks.addPathPsmPlugin.mockResolvedValue({ version: 1, plugins: {}, customPaths: ['/Users/test/plugins/local-plugin.mjs'] })
    mocks.removeDevPsmPlugin.mockResolvedValue({ version: 1, plugins: {}, devProjects: [] })
    mocks.removePathPsmPlugin.mockResolvedValue({ version: 1, plugins: {}, customPaths: [] })
    mocks.installPsmPlugin.mockResolvedValue({ entries: [], stdout: '', stderr: '' })
    mocks.searchPsmPluginMarket.mockResolvedValue({ query: 'psm plugin', total: 0, results: [] })
    mocks.uninstallPsmPlugin.mockResolvedValue({ entries: [], stdout: '', stderr: '' })
    mocks.updatePsmPlugins.mockResolvedValue({ entries: [], stdout: '', stderr: '' })
    mocks.setPsmPluginSettings.mockResolvedValue({ version: 1, plugins: {} })
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'list_model_options_fast' || command === 'list_model_options_full') {
        return [
          { provider: 'openai', model: 'gpt-4o' },
          { provider: 'anthropic', model: 'claude-sonnet-4-5' },
        ]
      }
      return null
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps marketplace search lazy outside the marketplace menu', async () => {
    mocks.reload.mockResolvedValueOnce([builtinPlugin, npmPlugin])

    render(<PsmPluginsSettings />)

    await screen.findByText('Installed plugins')
    expect(mocks.searchPsmPluginMarket).not.toHaveBeenCalled()
  })

  it('installs npm package and refreshes host state', async () => {
    mocks.reload.mockResolvedValueOnce([builtinPlugin, npmPlugin]).mockResolvedValueOnce([builtinPlugin, npmPlugin, installedPlugin])

    render(<PsmPluginsSettings mode="market" />)

    await screen.findByText('NPM package')
    fireEvent.change(screen.getByPlaceholderText('npm package name'), {
      target: { value: '@acme/new-plugin' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    await waitFor(() => expect(mocks.installPsmPlugin).toHaveBeenCalledWith('@acme/new-plugin'))
    expect(mocks.reload).toHaveBeenCalledTimes(2)
  })

  it('adds path plugin entry and refreshes host state', async () => {
    mocks.reload.mockResolvedValueOnce([builtinPlugin, npmPlugin]).mockResolvedValueOnce([builtinPlugin, npmPlugin, pathPlugin])

    render(<PsmPluginsSettings mode="sources" />)

    await screen.findByText('Path plugin')
    fireEvent.change(screen.getByPlaceholderText('local plugin entry path'), {
      target: { value: '/Users/test/plugins/local-plugin.mjs' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add path' }))

    await waitFor(() => expect(mocks.addPathPsmPlugin).toHaveBeenCalledWith('/Users/test/plugins/local-plugin.mjs'))
    await screen.findByText('Path Local')
    expect(mocks.reload).toHaveBeenCalledTimes(2)
  })

  it('adds dev plugin project, builds it, and refreshes host state', async () => {
    mocks.reload.mockResolvedValueOnce([builtinPlugin, npmPlugin]).mockResolvedValueOnce([builtinPlugin, npmPlugin, devPlugin])

    render(<PsmPluginsSettings mode="developer" />)

    await screen.findByText('Dev Preview')
    fireEvent.change(screen.getByPlaceholderText('local plugin project directory'), {
      target: { value: '/Users/test/plugins/dev-plugin' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add & Preview' }))

    await waitFor(() => expect(mocks.addDevPsmPlugin).toHaveBeenCalledWith('/Users/test/plugins/dev-plugin'))
    await waitFor(() => expect(mocks.buildDevPsmPlugin).toHaveBeenCalledWith('/Users/test/plugins/dev-plugin'))
    await screen.findByText('Dev Local')
    expect(mocks.reload).toHaveBeenCalledTimes(2)
  })

  it('rebuilds an installed dev plugin from its project path', async () => {
    mocks.reload.mockResolvedValueOnce([builtinPlugin, devPlugin]).mockResolvedValueOnce([builtinPlugin, devPlugin])

    render(<PsmPluginsSettings />)

    await screen.findByText('Dev Local')
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild' }))

    await waitFor(() => expect(mocks.buildDevPsmPlugin).toHaveBeenCalledWith('/Users/test/plugins/dev-plugin'))
    expect(mocks.reload).toHaveBeenCalledTimes(2)
  })

  it('renders per-plugin configuration and persists setting updates', async () => {
    mocks.reload.mockResolvedValueOnce([builtinPlugin, npmPlugin]).mockResolvedValueOnce([
      { ...builtinPlugin, settings: { provider: 'openai', model: 'gpt-4o', thinkingLevel: 'high', limit: 8 } },
      npmPlugin,
    ])

    render(<PsmPluginsSettings pluginId="builtin.sidechat" />)

    await screen.findByText('Sidechat Settings')
    fireEvent.change(screen.getByLabelText('Thinking level'), { target: { value: 'high' } })

    await waitFor(() => expect(mocks.setPsmPluginSettings).toHaveBeenCalledWith({
      pluginId: 'builtin.sidechat',
      settings: { provider: 'openai', model: 'gpt-4o', thinkingLevel: 'high', limit: 8 },
      source: 'builtin',
      packageName: null,
      entryPath: null,
      projectPath: null,
    }))
  })

  it('renders model settings as a unified selector sourced from model config center', async () => {
    mocks.reload.mockResolvedValueOnce([builtinPlugin, npmPlugin]).mockResolvedValueOnce([
      { ...builtinPlugin, settings: { provider: 'anthropic', model: '', thinkingLevel: 'medium', limit: 8 } },
      npmPlugin,
    ])

    render(<PsmPluginsSettings pluginId="builtin.sidechat" />)

    expect(screen.queryByLabelText('Default provider')).toBeNull()

    const model = await screen.findByLabelText('Default model')
    expect(model.tagName).toBe('BUTTON')
    expect(model.textContent).toContain('openai/gpt-4o')

    fireEvent.click(model)
    fireEvent.change(await screen.findByPlaceholderText('Search models...'), { target: { value: 'claude' } })
    fireEvent.click(await screen.findByRole('button', { name: /anthropic\/claude-sonnet-4-5/i }))

    await waitFor(() => expect(mocks.setPsmPluginSettings).toHaveBeenCalledWith({
      pluginId: 'builtin.sidechat',
      settings: { provider: 'anthropic', model: 'claude-sonnet-4-5', thinkingLevel: 'medium', limit: 8 },
      source: 'builtin',
      packageName: null,
      entryPath: null,
      projectPath: null,
    }))
  })

  it('searches all models and saves the provider/model pair from model selection', async () => {
    const autoPlugin = { ...builtinPlugin, settings: { provider: '', model: '', thinkingLevel: 'medium', limit: 8 } }
    mocks.reload.mockResolvedValueOnce([autoPlugin, npmPlugin]).mockResolvedValueOnce([
      { ...autoPlugin, settings: { provider: 'anthropic', model: 'claude-sonnet-4-5', thinkingLevel: 'medium', limit: 8 } },
      npmPlugin,
    ])

    render(<PsmPluginsSettings pluginId="builtin.sidechat" />)

    const model = await screen.findByLabelText('Default model')
    fireEvent.click(model)
    fireEvent.change(await screen.findByPlaceholderText('Search models...'), { target: { value: 'claude' } })
    fireEvent.click(await screen.findByRole('button', { name: /anthropic\/claude-sonnet-4-5/i }))

    await waitFor(() => expect(mocks.setPsmPluginSettings).toHaveBeenCalledWith({
      pluginId: 'builtin.sidechat',
      settings: { provider: 'anthropic', model: 'claude-sonnet-4-5', thinkingLevel: 'medium', limit: 8 },
      source: 'builtin',
      packageName: null,
      entryPath: null,
      projectPath: null,
    }))
  })

  it('keeps the selected model visible while plugin settings are reloading', async () => {
    const autoPlugin = { ...builtinPlugin, settings: { provider: '', model: '', thinkingLevel: 'medium', limit: 8 } }
    let resolveReload: ((value: typeof autoPlugin[]) => void) | null = null
    const pendingReload = new Promise<typeof autoPlugin[]>((resolve) => {
      resolveReload = resolve
    })

    mocks.reload.mockResolvedValueOnce([autoPlugin, npmPlugin]).mockImplementationOnce(() => pendingReload)

    render(<PsmPluginsSettings pluginId="builtin.sidechat" />)

    const model = await screen.findByLabelText('Default model')
    fireEvent.click(model)
    fireEvent.change(await screen.findByPlaceholderText('Search models...'), { target: { value: 'claude' } })
    fireEvent.click(await screen.findByRole('button', { name: /anthropic\/claude-sonnet-4-5/i }))

    await waitFor(() => expect(mocks.setPsmPluginSettings).toHaveBeenCalledWith({
      pluginId: 'builtin.sidechat',
      settings: { provider: 'anthropic', model: 'claude-sonnet-4-5', thinkingLevel: 'medium', limit: 8 },
      source: 'builtin',
      packageName: null,
      entryPath: null,
      projectPath: null,
    }))

    expect(screen.getByLabelText('Default model').textContent).toContain('anthropic/claude-sonnet-4-5')

    resolveReload?.([
      { ...autoPlugin, settings: { provider: 'anthropic', model: 'claude-sonnet-4-5', thinkingLevel: 'medium', limit: 8 } },
      npmPlugin,
    ])

    await waitFor(() => expect(screen.getByLabelText('Default model').textContent).toContain('anthropic/claude-sonnet-4-5'))
  })

  it('shows remove controls for npm, path, and dev plugins and refreshes after removal', async () => {
    mocks.reload
      .mockResolvedValueOnce([builtinPlugin, npmPlugin, pathPlugin, devPlugin])
      .mockResolvedValueOnce([builtinPlugin, pathPlugin, devPlugin])
      .mockResolvedValueOnce([builtinPlugin, devPlugin])
      .mockResolvedValueOnce([builtinPlugin])

    render(<PsmPluginsSettings />)

    await screen.findByText('Built-in Sidechat')
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(3)

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    await waitFor(() => expect(mocks.uninstallPsmPlugin).toHaveBeenCalledWith('@acme/psm-sidechat'))
    await waitFor(() => expect(screen.queryByText('NPM Sidechat')).toBeNull())

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    await waitFor(() => expect(mocks.removePathPsmPlugin).toHaveBeenCalledWith('/Users/test/plugins/local-plugin.mjs'))
    await waitFor(() => expect(screen.queryByText('Path Local')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(mocks.removeDevPsmPlugin).toHaveBeenCalledWith('/Users/test/plugins/dev-plugin'))
    await waitFor(() => expect(screen.queryByText('Dev Local')).toBeNull())
  })
})
