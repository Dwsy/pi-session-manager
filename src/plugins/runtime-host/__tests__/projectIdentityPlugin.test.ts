// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/transport', () => ({
  invoke: vi.fn(async () => {
    throw new Error('OpenBot metadata requires the desktop runtime')
  }),
  isTauri: () => false,
}))

import { resolveProjectIdentity } from '@/utils/projectIdentity'
import { PsmPluginHost } from '../host'
import type { PsmPluginLoadEntry } from '../types'

const REAL_AGENT_PATH = '/Users/dev/OpenBot/Agents/agent-da66bdca-0664-440c-a271-585ab5c62164'
const REAL_AGENT_NAME = 'agent-da66bdca-0664-440c-a271-585ab5c62164'

const pluginEntry: PsmPluginLoadEntry = {
  source: 'builtin',
  sourceId: 'extensions/psm-project-identity',
  async load() {
    return import('../../../../extensions/psm-project-identity/index.ts')
  },
}

function createHost() {
  return new PsmPluginHost({
    builtinEntries: [pluginEntry],
    services: {
      loadConfig: async () => ({ version: 1, plugins: {} }),
      listNpmEntries: async () => [],
    },
  })
}

describe('builtin project identity plugin', () => {
  it('activates through the real host and publishes its providers', async () => {
    const host = createHost()

    const plugins = await host.reload()

    expect(
      plugins.find((plugin) => plugin.id === 'builtin.project-identity'),
    ).toMatchObject({
      state: 'active',
      permissions: [{ permission: 'openbot:read', granted: true }],
    })
    expect(
      host.getSessionUiSnapshot().projectIdentityProviders.map((provider) => ({
        id: provider.id,
        priority: provider.priority,
        pluginId: provider.pluginId,
      })),
    ).toEqual([
      {
        id: 'builtin.project-identity.generated-directories',
        priority: 100,
        pluginId: 'builtin.project-identity',
      },
    ])
  })

  it('degrades to the shortened directory label when agent metadata is unavailable', async () => {
    const host = createHost()
    await host.reload()

    const providers = host.getSessionUiSnapshot().projectIdentityProviders
    const identity = resolveProjectIdentity(
      { path: REAL_AGENT_PATH, name: REAL_AGENT_NAME },
      providers,
    )

    expect(identity.label).toBe('Bot da66bdca')
    expect(identity.avatar?.kind).toBe('emoji')
  })
})
