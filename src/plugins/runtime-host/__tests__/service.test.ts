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
  installPsmPlugin,
  reloadPsmPlugins,
  uninstallPsmPlugin,
  updatePsmPlugins,
} from '../service'

describe('runtime-host service npm lifecycle commands', () => {
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

  it('keeps non-Tauri fallback safe for web/demo runtime', async () => {
    mocks.isTauri.mockReturnValue(false)

    await expect(installPsmPlugin('@acme/psm-sidechat')).resolves.toMatchObject({ entries: [] })
    await expect(uninstallPsmPlugin('@acme/psm-sidechat')).resolves.toMatchObject({ entries: [] })
    await expect(updatePsmPlugins()).resolves.toMatchObject({ entries: [] })
    await expect(reloadPsmPlugins()).resolves.toEqual([])
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
