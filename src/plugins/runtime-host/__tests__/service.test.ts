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
  addPathPsmPlugin,
  installPsmPlugin,
  listPathPsmPluginEntries,
  loadPsmPluginConfig,
  readPathPsmPluginModuleSource,
  reloadPsmPlugins,
  removePathPsmPlugin,
  searchPsmPluginMarket,
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

  it('maps path plugin calls to Tauri commands with camelCase payloads', async () => {
    mocks.isTauri.mockReturnValue(true)
    mocks.invoke.mockResolvedValue([])

    await listPathPsmPluginEntries()
    await addPathPsmPlugin('/tmp/local-plugin.mjs')
    await removePathPsmPlugin('/tmp/local-plugin.mjs')
    await readPathPsmPluginModuleSource('/tmp/local-plugin.mjs')

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
  })

  it('uses HTTP invoke for web runtime plugin config and path plugin calls', async () => {
    mocks.isTauri.mockReturnValue(false)
    mocks.httpInvoke
      .mockResolvedValueOnce({ version: 1, plugins: { 'path.local': { enabled: true } }, customPaths: ['/tmp/local-plugin.mjs'] })
      .mockResolvedValueOnce([{ entryPath: '/tmp/local-plugin.mjs' }])
      .mockResolvedValueOnce({ version: 1, plugins: {}, customPaths: ['/tmp/local-plugin.mjs'] })
      .mockResolvedValueOnce({ version: 1, plugins: {}, customPaths: [] })
      .mockResolvedValueOnce('export default {}')
      .mockResolvedValueOnce({ query: 'psm plugin', total: 0, results: [] })

    await expect(loadPsmPluginConfig()).resolves.toMatchObject({ customPaths: ['/tmp/local-plugin.mjs'] })
    await expect(listPathPsmPluginEntries()).resolves.toEqual([{ entryPath: '/tmp/local-plugin.mjs' }])
    await expect(addPathPsmPlugin('/tmp/local-plugin.mjs')).resolves.toMatchObject({ customPaths: ['/tmp/local-plugin.mjs'] })
    await expect(removePathPsmPlugin('/tmp/local-plugin.mjs')).resolves.toMatchObject({ customPaths: [] })
    await expect(readPathPsmPluginModuleSource('/tmp/local-plugin.mjs')).resolves.toBe('export default {}')
    await expect(searchPsmPluginMarket({ query: 'psm plugin' })).resolves.toEqual({ query: 'psm plugin', total: 0, results: [] })

    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(1, 'load_psm_plugin_config', undefined)
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(2, 'list_path_psm_plugin_entries', undefined)
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(3, 'add_path_psm_plugin', { entryPath: '/tmp/local-plugin.mjs' })
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(4, 'remove_path_psm_plugin', { entryPath: '/tmp/local-plugin.mjs' })
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(5, 'read_path_psm_plugin_module_source', { entryPath: '/tmp/local-plugin.mjs' })
    expect(mocks.httpInvoke).toHaveBeenNthCalledWith(6, 'search_psm_plugin_market', { query: 'psm plugin' })
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
