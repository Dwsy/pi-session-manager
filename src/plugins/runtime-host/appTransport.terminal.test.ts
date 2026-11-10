import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoked = vi.hoisted(() => vi.fn())
vi.mock('@/transport', () => ({ isTauri: () => true, invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invoked }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }))

import { appPsmTransport, registerLocalTerminalOwner } from './appTransport'

const payload = { cwd: '/repo', label: 'Repo Terminal', __psm: { pluginId: 'builtin.psm-mesh', permissions: ['terminal:open'] } }
const validated = { cwd: '/repo', label: 'Repo Terminal', pluginId: 'builtin.psm-mesh' }

describe('plugin terminal owner and backend validation', () => {
  let detach: (() => void) | null = null
  beforeEach(() => {
    invoked.mockReset()
    invoked.mockResolvedValue(validated)
  })
  afterEach(() => { detach?.(); detach = null })

  it('fails closed without a local frontend owner and never dispatches a global terminal event', async () => {
    await expect(appPsmTransport.invoke('plugin_terminal_open', payload)).rejects.toThrow('No frontend terminal owner')
    expect(invoked).not.toHaveBeenCalled()
  })

  it('opens through only this renderer after Rust validates the directory and plugin permissions', async () => {
    const accepted = vi.fn()
    detach = registerLocalTerminalOwner({ ownerKey: () => 'mesh:sessionA', accept: accepted })
    await expect(appPsmTransport.invoke('plugin_terminal_open', payload)).resolves.toBeUndefined()
    expect(invoked).toHaveBeenCalledExactlyOnceWith('plugin_dispatch_command', {
      command: 'plugin_terminal_open', payload,
    })
    expect(accepted).toHaveBeenCalledExactlyOnceWith(validated)
  })

  it('rejects late receipts when the owning view navigates or is unmounted', async () => {
    let resolve!: (value: typeof validated) => void
    invoked.mockImplementation(() => new Promise((r) => { resolve = r }))
    let view = 'mesh:sessionA'
    const accepted = vi.fn()
    detach = registerLocalTerminalOwner({ ownerKey: () => view, accept: accepted })
    const response = appPsmTransport.invoke('plugin_terminal_open', payload)
    view = 'list:sessionB'
    resolve(validated)
    await expect(response).rejects.toThrow('owning view changed')
    expect(accepted).not.toHaveBeenCalled()
  })

  it('propagates owner-denied feature errors without declaring a PTY ready', async () => {
    detach = registerLocalTerminalOwner({
      ownerKey: () => 'mesh:sessionA',
      accept: () => { throw new Error('terminal disabled in this window') },
    })
    await expect(appPsmTransport.invoke('plugin_terminal_open', payload)).rejects.toThrow('terminal disabled')
  })
})
