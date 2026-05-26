import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  httpInvoke: vi.fn(),
  isTauri: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}))

vi.mock('@/transport', () => ({
  invoke: mocks.httpInvoke,
  isTauri: mocks.isTauri,
}))

import {
  addDevPsmPlugin,
  addPathPsmPlugin,
  buildDevPsmPlugin,
  installPsmPlugin,
  listDevPsmPluginEntries,
  listPathPsmPluginEntries,
  loadPsmPluginConfig,
  readDevPsmPluginModuleSource,
  readPathPsmPluginModuleSource,
  removeDevPsmPlugin,
  reloadPsmPlugins,
  removePathPsmPlugin,
  searchPsmPluginMarket,
  setPsmPluginPermissions,
  uninstallPsmPlugin,
  updatePsmPlugins,
} from '../service'

describe('runtime-host service plugin lifecycle commands', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
    mocks.httpInvoke.mockReset()
    mocks.isTauri.mockReset()
  })

  it('maps npm lifecycle calls to Tauri commands with camelCase payloads', async () => {
    mocks.isTauri.mockReturnValue(true)
    mocks.invoke.mockResolvedValue({ entries: [], stdout: '', stderr: '' })

    await installPsmPlugin('@acme/psm-sidechat')
    await uninstallPsmPlugin('@acme/psm-sidechat')
    await updatePsmPlugins()
    await reloadPsmPlugins()

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'install_psm_plugin', {
      packageName: '@acme/psm-sidechat',
    })
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'uninstall_psm_plugin', {
      packageName: '@acme/psm-sidechat',
    })
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, 'update_psm_plugins', undefined)
    expect(mocks.invoke).toHaveBeenNthCalledWith(4, 'reload_psm_plugins', undefined)
  })

  it('maps plugin permission updates to Tauri commands with camelCase payloads', async () => {
    mocks.isTauri.mockReturnValue(true)
    mocks.invoke.mockResolvedValue({ version: 1, plugins: {} })

    await setPsmPluginPermissions({
      pluginId: 'builtin.sidechat',
      permissionOverrides: { 'agent:invoke': false },
      source: 'builtin',
      packageName: null,
      entryPath: null,
      projectPath: null,
    })

    expect(mocks.invoke).toHaveBeenCalledWith('set_psm_plugin_permissions', {
      pluginId: 'builtin.sidechat',
      permissionOverrides: { 'agent:invoke': false },
      source: 'builtin',
      packageName: null,
      entryPath: null,
      projectPath: null,
    })
  })

  it('maps npm market search calls to Tauri commands with camelCase payloads', async () => {
    mocks.isTauri.mockReturnValue(true)
    mocks.invoke.mockResolvedValue({ query: 'psm', total: 0, results: [] })

    await searchPsmPluginMarket({ query: 'psm', size: 8, from: 2 })

    expect(mocks.invoke).toHaveBeenCalledWith('search_psm_plugin_market', {
      query: 'psm',
      size: 8,
      from: 2,
    })
  })

  it('maps path and dev plugin calls to Tauri commands with camelCase payloads', async () => {
    mocks.isTauri.mockReturnValue(true)
    mocks.invoke.mockImplementation((command: string) => {
      if (command.startsWith('read_')) return Promise.resolve('export default {}')
      return Promise.resolve([])
    })

    await listPathPsmPluginEntries()
    await addPathPsmPlugin('/tmp/local-plugin.mjs')
    await removePathPsmPlugin('/tmp/local-plugin.mjs')
    await readPathPsmPluginModuleSource('/tmp/local-plugin.mjs')
    await listDevPsmPluginEntries()
    await addDevPsmPlugin('/tmp/dev-plugin')
    await buildDevPsmPlugin('/tmp/dev-plugin')
    await readDevPsmPluginModuleSource('/tmp/dev-plugin/dist/index.js', '/tmp/dev-plugin')
    await removeDevPsmPlugin('/tmp/dev-plugin')

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'list_path_psm_plugin_entries', undefined)
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'add_path_psm_plugin', {
      entryPath: '/tmp/local-plugin.mjs',
    })
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, 'remove_path_psm_plugin', {
      entryPath: '/tmp/local-plugin.mjs',
    })
    expect(mocks.invoke).toHaveBeenNthCalledWith(4, 'read_path_psm_plugin_module_source', {
      entryPath: '/tmp/local-plugin.mjs',
    })
    expect(mocks.invoke).toHaveBeenNthCalledWith(5, 'list_dev_psm_plugin_entries', undefined)
    expect(mocks.invoke).toHaveBeenNthCalledWith(6, 'add_dev_psm_plugin', {
      projectPath: '/tmp/dev-plugin',
    })
    expect(mocks.invoke).toHaveBeenNthCalledWith(7, 'build_dev_psm_plugin', {
      projectPath: '/tmp/dev-plugin',
    })
    expect(mocks.invoke).toHaveBeenNthCalledWith(8, 'read_dev_psm_plugin_module_source', {
      entryPath: '/tmp/dev-plugin/dist/index.js',
      projectPath: '/tmp/dev-plugin',
    })
    expect(mocks.invoke).toHaveBeenNthCalledWith(9, 'remove_dev_psm_plugin', {
      projectPath: '/tmp/dev-plugin',
    })
  })

  it('uses HTTP invoke for web runtime plugin config and path plugin calls', async () => {
    mocks.isTauri.mockReturnValue(false)
    mocks.httpInvoke
      .mockResolvedValueOnce({ version: 1, plugins: { 'path.local': { enabled: true } }, customPaths: ['/tmp/local-plugin.mjs'] })
      .mockResolvedValueOnce([{ entryPath: '/tmp/local-plugin.mjs' }])
      .mockResolvedValueOnce({ version: 1, plugins: {}, customPaths: ['/tmp/local-plugin.mjs'] })
      .mockResolvedValueOnce({ version: 1, plugins: {}, customPaths: [] })
      .mockResolvedValueOnce('export default {}')
      .mockResolvedValueOnce([{ projectPath: '/tmp/dev-plugin', entryPath: '/tmp/dev-plugin/dist/index.js' }])
      .mockResolvedValueOnce({ version: 1, plugins: {}, devProjects: ['/tmp/dev-plugin'] })
      .mockResolvedValueOnce({ entries: [], stdout: '', stderr: '' })
      .mockResolvedValueOnce('export const manifest = {}')
      .mockResolvedValueOnce({ version: 1, plugins: {}, devProjects: [] })
      .mockResolvedValueOnce({ query: 'psm plugin', total: 0, results: [] })

    await expect(loadPsmPluginConfig()).resolves.toMatchObject({ customPaths: ['/tmp/local-plugin.mjs'] })
    await expect(listPathPsmPluginEntries()).resolves.toEqual([{ entryPath: '/tmp/local-plugin.mjs' }])
    await expect(addPathPsmPlugin('/tmp/local-plugin.mjs')).resolves.toMatchObject({ customPaths: ['/tmp/local-plugin.mjs'] })
    await expect(removePathPsmPlugin('/tmp/local-plugin.mjs')).resolves.toMatchObject({ customPaths: [] })
    await expect(readPathPsmPluginModuleSource('/tmp/local-plugin.mjs')).resolves.toBe('export default {}')
    await expect(listDevPsmPluginEntries()).resolves.toEqual([{ projectPath: '/tmp/dev-plugin', entryPath: '/tmp/dev-plugin/dist/index.js' }])
    await expect(addDevPsmPlugin('/tmp/dev-plugin')).resolves.toMatchObject({ devProjects: ['/tmp/dev-plugin'] })
    await expect(buildDevPsmPlugin('/tmp/dev-plugin')).resolves.toMatchObject({ entries: [] })
    await expect(readDevPsmPluginModuleSource('/tmp/dev-plugin/dist/index.js', '/tmp/dev-plugin')).resolves.toBe('export const manifest = {}')
    await expect(removeDevPsmPlugin('/tmp/dev-plugin')).resolves.toMatchObject({ devProjects: [] })
    await expect(searchPsmPluginMarket({ query: 'psm plugin' })).resolves.toEqual({ query: 'psm plugin', total: 0, results: [] })

    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(1, 'load_psm_plugin_config', undefined)
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(2, 'list_path_psm_plugin_entries', undefined)
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(3, 'add_path_psm_plugin', { entryPath: '/tmp/local-plugin.mjs' })
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(4, 'remove_path_psm_plugin', { entryPath: '/tmp/local-plugin.mjs' })
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(5, 'read_path_psm_plugin_module_source', { entryPath: '/tmp/local-plugin.mjs' })
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(6, 'list_dev_psm_plugin_entries', undefined)
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(7, 'add_dev_psm_plugin', { projectPath: '/tmp/dev-plugin' })
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(8, 'build_dev_psm_plugin', { projectPath: '/tmp/dev-plugin' })
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(9, 'read_dev_psm_plugin_module_source', { entryPath: '/tmp/dev-plugin/dist/index.js', projectPath: '/tmp/dev-plugin' })
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(10, 'remove_dev_psm_plugin', { projectPath: '/tmp/dev-plugin' })
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(11, 'search_psm_plugin_market', { query: 'psm plugin' })
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
