// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addPathPsmPlugin: vi.fn(),
  getPsmPluginPaths: vi.fn(),
  installPsmPlugin: vi.fn(),
  reload: vi.fn(),
  setPsmPluginEnabled: vi.fn(),
  setPsmPluginSettings: vi.fn(),
  removePathPsmPlugin: vi.fn(),
  uninstallPsmPlugin: vi.fn(),
  updatePsmPlugins: vi.fn(),
}))

vi.mock('@/plugins/runtime-host', () => ({
  addPathPsmPlugin: mocks.addPathPsmPlugin,
  getPsmPluginPaths: mocks.getPsmPluginPaths,
  installPsmPlugin: mocks.installPsmPlugin,
  psmPluginHost: { reload: mocks.reload },
  setPsmPluginEnabled: mocks.setPsmPluginEnabled,
  setPsmPluginSettings: mocks.setPsmPluginSettings,
  removePathPsmPlugin: mocks.removePathPsmPlugin,
  uninstallPsmPlugin: mocks.uninstallPsmPlugin,
  updatePsmPlugins: mocks.updatePsmPlugins,
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

describe('PsmPluginsSettings npm lifecycle controls', () => {
  beforeEach(() => {
    mocks.addPathPsmPlugin.mockReset()
    mocks.getPsmPluginPaths.mockReset()
    mocks.installPsmPlugin.mockReset()
    mocks.reload.mockReset()
    mocks.setPsmPluginEnabled.mockReset()
    mocks.setPsmPluginSettings.mockReset()
    mocks.removePathPsmPlugin.mockReset()
    mocks.uninstallPsmPlugin.mockReset()
    mocks.updatePsmPlugins.mockReset()

    mocks.getPsmPluginPaths.mockResolvedValue({
      configPath: '/Users/test/.pi/pi-session-manager/plugins.json',
      npmDir: '/Users/test/.pi/pi-session-manager/extensions/npm',
      customPaths: [],
    })
    mocks.addPathPsmPlugin.mockResolvedValue({ version: 1, plugins: {}, customPaths: ['/Users/test/plugins/local-plugin.mjs'] })
    mocks.removePathPsmPlugin.mockResolvedValue({ version: 1, plugins: {}, customPaths: [] })
    mocks.installPsmPlugin.mockResolvedValue({ entries: [], stdout: '', stderr: '' })
    mocks.uninstallPsmPlugin.mockResolvedValue({ entries: [], stdout: '', stderr: '' })
    mocks.updatePsmPlugins.mockResolvedValue({ entries: [], stdout: '', stderr: '' })
    mocks.setPsmPluginSettings.mockResolvedValue({ version: 1, plugins: {} })
  })

  afterEach(() => {
    cleanup()
  })

  it('installs npm package and refreshes host state', async () => {
    mocks.reload.mockResolvedValueOnce([builtinPlugin, npmPlugin]).mockResolvedValueOnce([builtinPlugin, npmPlugin, installedPlugin])

    render(<PsmPluginsSettings />)

    await screen.findByText('NPM Sidechat')
    fireEvent.change(screen.getByPlaceholderText('npm package name'), {
      target: { value: '@acme/new-plugin' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))

    await waitFor(() => expect(mocks.installPsmPlugin).toHaveBeenCalledWith('@acme/new-plugin'))
    await screen.findByText('New Plugin')
    expect(mocks.reload).toHaveBeenCalledTimes(2)
  })

  it('adds path plugin entry and refreshes host state', async () => {
    mocks.reload.mockResolvedValueOnce([builtinPlugin, npmPlugin]).mockResolvedValueOnce([builtinPlugin, npmPlugin, pathPlugin])

    render(<PsmPluginsSettings />)

    await screen.findByText('NPM Sidechat')
    fireEvent.change(screen.getByPlaceholderText('local plugin entry path'), {
      target: { value: '/Users/test/plugins/local-plugin.mjs' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add path' }))

    await waitFor(() => expect(mocks.addPathPsmPlugin).toHaveBeenCalledWith('/Users/test/plugins/local-plugin.mjs'))
    await screen.findByText('Path Local')
    expect(mocks.reload).toHaveBeenCalledTimes(2)
  })

  it('renders per-plugin configuration and persists setting updates', async () => {
    mocks.reload.mockResolvedValueOnce([builtinPlugin, npmPlugin]).mockResolvedValueOnce([
      { ...builtinPlugin, settings: { thinkingLevel: 'high', limit: 8 } },
      npmPlugin,
    ])

    render(<PsmPluginsSettings pluginId="builtin.sidechat" />)

    await screen.findByText('Sidechat Settings')
    fireEvent.change(screen.getByLabelText('Thinking level'), { target: { value: 'high' } })

    await waitFor(() => expect(mocks.setPsmPluginSettings).toHaveBeenCalledWith({
      pluginId: 'builtin.sidechat',
      settings: { thinkingLevel: 'high', limit: 8 },
      source: 'builtin',
      packageName: null,
      entryPath: null,
    }))
  })

  it('shows remove controls for npm and path plugins and refreshes after removal', async () => {
    mocks.reload.mockResolvedValueOnce([builtinPlugin, npmPlugin, pathPlugin]).mockResolvedValueOnce([builtinPlugin, pathPlugin]).mockResolvedValueOnce([builtinPlugin])

    render(<PsmPluginsSettings />)

    await screen.findByText('Built-in Sidechat')
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    await waitFor(() => expect(mocks.uninstallPsmPlugin).toHaveBeenCalledWith('@acme/psm-sidechat'))
    await waitFor(() => expect(screen.queryByText('NPM Sidechat')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(mocks.removePathPsmPlugin).toHaveBeenCalledWith('/Users/test/plugins/local-plugin.mjs'))
    await waitFor(() => expect(screen.queryByText('Path Local')).toBeNull())
  })
})
