import { describe, expect, it } from 'vitest'
import { createPluginCapabilityClient } from '../../packages/runtime-sdk/src/client'
import type { PsmTransport } from '../../packages/runtime-sdk/src/types'

describe('plugin SDK live-agent and terminal capabilities', () => {
  it('sends every Mesh control through permission-scoped Hub commands and never Pi Live/bridge', async () => {
    const seen: Array<{ command: string; payload?: Record<string, unknown> }> = []
    const transport = {
      invoke: async <T>(command: string, payload?: Record<string, unknown>) => {
        seen.push({ command, payload })
        if (command === 'plugin_mesh_peers') return { peers: [] } as T
        if (command === 'plugin_mesh_herdr_agents') return { agents: [] } as T
        return { ok: true } as T
      },
    } as PsmTransport
    const client = createPluginCapabilityClient({
      transport,
      permissions: { pluginId: 'builtin.psm-mesh', permissions: ['mesh:read', 'mesh:control'] },
    })
    const source = '11111111-1111-4111-8111-111111111111'
    const target = '22222222-2222-4222-8222-222222222222'
    await expect(client.mesh.peers()).resolves.toEqual([])
    await expect(client.mesh.herdrAgents()).resolves.toEqual([])
    await expect(client.mesh.focus(target)).resolves.toEqual({ ok: true })
    await expect(client.mesh.send({ targetSessionId: target, fromSessionId: source, text: '/my-command', mode: 'steer' })).resolves.toEqual({ ok: true })
    await expect(client.mesh.send({ targetSessionId: target, text: 'next', mode: 'followUp' })).resolves.toEqual({ ok: true })
    await expect(client.mesh.cancel(target)).resolves.toEqual({ ok: true })
    await expect(client.mesh.follow({ fromSessionId: source, targetSessionId: target, following: true })).resolves.toEqual({ ok: true })
    await expect(client.mesh.follow({ fromSessionId: source, targetSessionId: target, following: false })).resolves.toEqual({ ok: true })
    expect(seen.map(({ command }) => command)).toEqual([
      'plugin_mesh_peers',
      'plugin_mesh_herdr_agents',
      'plugin_mesh_focus',
      'plugin_mesh_message',
      'plugin_mesh_message',
      'plugin_mesh_cancel',
      'plugin_mesh_follow',
      'plugin_mesh_follow',
    ])
    for (const { payload } of seen) {
      expect(payload?.__psm).toEqual({
        pluginId: 'builtin.psm-mesh',
        permissions: ['mesh:read', 'mesh:control'],
      })
    }
    expect(seen.filter(({ command }) => /pi_live|pi-live|bridge|plugin_live_agents/i.test(command))).toHaveLength(0)
  })

  it('propagates Mesh disconnect errors without making any fallback invoke', async () => {
    const calls: string[] = []
    const transport = {
      invoke: async <T>(command: string) => {
        calls.push(command)
        throw new Error('Hub unreachable')
      },
    } as PsmTransport
    const client = createPluginCapabilityClient({ transport, permissions: { pluginId: 'builtin.psm-mesh', permissions: ['mesh:control'] } })
    await expect(client.mesh.cancel('22222222-2222-4222-8222-222222222222')).rejects.toThrow('Hub unreachable')
    expect(calls).toEqual(['plugin_mesh_cancel'])
  })
  it('routes live-agent summaries and terminal open through permission-scoped host commands', async () => {
    const calls: Array<{ command: string; payload?: Record<string, unknown> }> = []
    const transport = {
      invoke: async <T>(command: string, payload?: Record<string, unknown>) => {
        calls.push({ command, payload })
        return (command === 'plugin_live_agents_list' ? [] : null) as T
      },
    } as PsmTransport

    const client = createPluginCapabilityClient({
      transport,
      permissions: {
        pluginId: 'builtin.psm-mesh',
        permissions: ['live-agents:read', 'terminal:open'],
      },
    })

    await expect(client.liveAgents.list()).resolves.toEqual([])
    await expect(client.terminal.open({ cwd: '/repo', label: 'repo' })).resolves.toBeUndefined()

    expect(calls).toEqual([
      {
        command: 'plugin_live_agents_list',
        payload: {
          __psm: {
            pluginId: 'builtin.psm-mesh',
            permissions: ['live-agents:read', 'terminal:open'],
          },
        },
      },
      {
        command: 'plugin_terminal_open',
        payload: {
          cwd: '/repo',
          label: 'repo',
          __psm: {
            pluginId: 'builtin.psm-mesh',
            permissions: ['live-agents:read', 'terminal:open'],
          },
        },
      },
    ])
  })
})
