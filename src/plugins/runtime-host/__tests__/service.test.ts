import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
}))

vi.mock('@/transport', () => ({
  isTauri: mocks.isTauri,
}))

import {
  addPathPsmPlugin,
  installPsmPlugin,
  listPathPsmPluginEntries,
  readPathPsmPluginModuleSource,
  reloadPsmPlugins,
  removePathPsmPlugin,
  uninstallPsmPlugin,
  updatePsmPlugins,
} from '../service'

describe('runtime-host service plugin lifecycle commands', () => {
  beforeEach(() => {
    mocks.invoke.mockReset()
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
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, 'update_psm_plugins')
    expect(mocks.invoke).toHaveBeenNthCalledWith(4, 'reload_psm_plugins')
  })

  it('maps path plugin calls to Tauri commands with camelCase payloads', async () => {
    mocks.isTauri.mockReturnValue(true)
    mocks.invoke.mockResolvedValue([])

    await listPathPsmPluginEntries()
    await addPathPsmPlugin('/tmp/local-plugin.mjs')
    await removePathPsmPlugin('/tmp/local-plugin.mjs')
    await readPathPsmPluginModuleSource('/tmp/local-plugin.mjs')

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'list_path_psm_plugin_entries')
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

  it('keeps non-Tauri fallback safe for web/demo runtime', async () => {
    mocks.isTauri.mockReturnValue(false)

    await expect(installPsmPlugin('@acme/psm-sidechat')).resolves.toMatchObject({ entries: [] })
    await expect(uninstallPsmPlugin('@acme/psm-sidechat')).resolves.toMatchObject({ entries: [] })
    await expect(updatePsmPlugins()).resolves.toMatchObject({ entries: [] })
    await expect(reloadPsmPlugins()).resolves.toEqual([])
    await expect(listPathPsmPluginEntries()).resolves.toEqual([])
    await expect(addPathPsmPlugin('/tmp/local-plugin.mjs')).resolves.toMatchObject({ customPaths: ['/tmp/local-plugin.mjs'] })
    await expect(removePathPsmPlugin('/tmp/local-plugin.mjs')).resolves.toMatchObject({ customPaths: [] })
    await expect(readPathPsmPluginModuleSource('/tmp/local-plugin.mjs')).rejects.toThrow('Path PSM plugins are only available in the Tauri runtime')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
