import { describe, expect, it, vi } from 'vitest'

import {
  buildOpenBotAgentIndex,
  hueFor,
  OPENBOT_AGENT_SUBTITLE,
  resolveGeneratedDirectoryIdentity,
  resolveOpenBotAgentIdentity,
} from './identity'

describe('resolveGeneratedDirectoryIdentity', () => {
  it('shortens an OpenBot agent workspace directory into a bot label', () => {
    const identity = resolveGeneratedDirectoryIdentity({
      path: '/Users/dev/OpenBot/Agents/agent-da66bdca-0664-440c-a271-585ab5c62164',
      name: 'agent-da66bdca-0664-440c-a271-585ab5c62164',
    })

    expect(identity).toEqual({
      label: 'Bot da66bdca',
      hidePath: true,
      avatar: {
        kind: 'emoji',
        value: '🤖',
        hue: hueFor('/Users/dev/OpenBot/Agents/agent-da66bdca-0664-440c-a271-585ab5c62164'),
      },
    })
  })

  it('shortens an OpenBot profile directory', () => {
    expect(
      resolveGeneratedDirectoryIdentity({
        path: '/Users/dev/OpenBot/Profiles/openbot-profile-RHUB5T',
        name: 'openbot-profile-RHUB5T',
      })?.label,
    ).toBe('Profile RHUB5T')
  })

  it('keeps ordinary project directories on the host default', () => {
    expect(
      resolveGeneratedDirectoryIdentity({ path: '/Users/dev/Work/bw-platform', name: 'bw-platform' }),
    ).toBeNull()
    expect(
      resolveGeneratedDirectoryIdentity({ path: '/Users/dev/Work/agent-notes', name: 'agent-notes' }),
    ).toBeNull()
  })

  it('ignores agent-like names that are not complete uuids', () => {
    expect(
      resolveGeneratedDirectoryIdentity({
        path: '/tmp/agent-da66bdca',
        name: 'agent-da66bdca',
      }),
    ).toBeNull()
  })

  it('keeps the same hue for the same path', () => {
    const first = resolveGeneratedDirectoryIdentity({
      path: '/Users/dev/OpenBot/Agents/agent-0c1665bf-15da-41ca-b864-eb64826a2884',
      name: 'agent-0c1665bf-15da-41ca-b864-eb64826a2884',
    })
    const second = resolveGeneratedDirectoryIdentity({
      path: '/Users/dev/OpenBot/Agents/agent-0c1665bf-15da-41ca-b864-eb64826a2884',
      name: 'agent-0c1665bf-15da-41ca-b864-eb64826a2884',
    })

    expect(first?.avatar?.hue).toBe(second?.avatar?.hue)
    expect(first?.avatar?.hue).toBeGreaterThanOrEqual(0)
    expect(first?.avatar?.hue).toBeLessThan(360)
  })
})

const ZERO_AGENT = {
  id: 'agent-da66bdca-0664-440c-a271-585ab5c62164',
  name: 'zero',
  title: '',
  avatarSeed: 'first-bot:avatar:0:7',
  avatarHue: 320,
  workspacePath: '/Users/dev/OpenBot/Agents/agent-da66bdca-0664-440c-a271-585ab5c62164',
}

const DEE_AGENT = {
  id: 'agent-0c1665bf-15da-41ca-b864-eb64826a2884',
  name: 'Dee',
  title: 'Reliability bot',
  avatarUrl: 'https://example.com/dee.png',
  workspacePath: '/Users/dev/OpenBot/Agents/agent-0c1665bf-15da-41ca-b864-eb64826a2884/',
}

describe('OpenBot agent identity', () => {
  it('resolves a bot workspace directory to its real name and avatar', () => {
    const index = buildOpenBotAgentIndex([ZERO_AGENT])

    expect(
      resolveOpenBotAgentIdentity(
        { path: '/Users/dev/OpenBot/Agents/agent-da66bdca-0664-440c-a271-585ab5c62164', name: 'agent-da66bdca-0664-440c-a271-585ab5c62164' },
        index,
      ),
    ).toMatchObject({
      label: 'zero',
      subtitle: OPENBOT_AGENT_SUBTITLE,
      avatar: { kind: 'url' },
    })
  })

  it('draws the same generated avatar OpenBot shows for the agent', () => {
    const index = buildOpenBotAgentIndex([ZERO_AGENT])
    const identity = resolveOpenBotAgentIdentity(
      { path: ZERO_AGENT.workspacePath, name: ZERO_AGENT.id },
      index,
    )

    expect(identity?.avatar?.kind).toBe('url')
    const svg = atob((identity?.avatar?.value ?? '').split(',')[1] ?? '')
    expect(svg).toContain('fill="#e152b0"')
    expect(svg).toContain('<mask id="bloub"')
  })

  it('falls back to the initial when the agent has no avatar seed', () => {
    const index = buildOpenBotAgentIndex([
      { ...ZERO_AGENT, avatarSeed: undefined, avatarHue: 320 },
    ])

    expect(
      resolveOpenBotAgentIdentity({ path: ZERO_AGENT.workspacePath, name: ZERO_AGENT.id }, index)
        ?.avatar,
    ).toEqual({ kind: 'initial', value: 'Z', hue: 320 })
  })

  it('matches by id when the recorded workspace path differs (renamed or moved)', () => {
    const index = buildOpenBotAgentIndex([ZERO_AGENT])

    expect(
      resolveOpenBotAgentIdentity(
        { path: '/tmp/elsewhere/agent-da66bdca-0664-440c-a271-585ab5c62164', name: 'agent-da66bdca-0664-440c-a271-585ab5c62164' },
        index,
      )?.label,
    ).toBe('zero')
  })

  it('prefers the agent title as subtitle and an https avatar url over initials', () => {
    const index = buildOpenBotAgentIndex([DEE_AGENT])

    expect(
      resolveOpenBotAgentIdentity(
        { path: DEE_AGENT.workspacePath, name: DEE_AGENT.id },
        index,
      ),
    ).toEqual({
      label: 'Dee',
      subtitle: 'Reliability bot',
      avatar: { kind: 'url', value: 'https://example.com/dee.png' },
      hidePath: true,
    })
  })

  it('normalizes path separators and trailing slashes', () => {
    const index = buildOpenBotAgentIndex([ZERO_AGENT])

    expect(
      resolveOpenBotAgentIdentity(
        {
          path: '\\Users\\Dev\\OpenBot\\Agents\\agent-da66bdca-0664-440c-a271-585ab5c62164\\',
          name: 'AGENT-DA66BDCA-0664-440C-A271-585AB5C62164',
        },
        index,
      )?.label,
    ).toBe('zero')
  })

  it('returns null for unknown projects and ignores malformed agent records', () => {
    const index = buildOpenBotAgentIndex([
      ZERO_AGENT,
      { id: '', name: 'nameless' },
      { id: 'agent-x', name: '  ' },
    ])

    expect(index.byId.size).toBe(1)
    expect(
      resolveOpenBotAgentIdentity({ path: '/Users/dev/Work/bw-platform', name: 'bw-platform' }, index),
    ).toBeNull()
  })
})

describe('integration with the host resolver', () => {
  it('renders the real bot identity ahead of the generated-directory fallback', async () => {
    const { resolveProjectIdentity } = await import('@/utils/projectIdentity')
    const agents = buildOpenBotAgentIndex([ZERO_AGENT])

    const identity = resolveProjectIdentity(
      {
        path: ZERO_AGENT.workspacePath,
        name: ZERO_AGENT.id,
      },
      [
        {
          id: 'builtin.project-identity.generated-directories',
          priority: 100,
          resolve: resolveGeneratedDirectoryIdentity,
        },
        {
          id: 'builtin.project-identity.openbot-agents',
          priority: 10,
          resolve: (project) => resolveOpenBotAgentIdentity(project, agents),
        },
      ],
    )

    expect(identity).toMatchObject({
      label: 'zero',
      subtitle: OPENBOT_AGENT_SUBTITLE,
      avatar: { kind: 'url' },
    })
  })

  it('falls back to the short directory label when metadata is missing', async () => {
    const { resolveProjectIdentity } = await import('@/utils/projectIdentity')

    const identity = resolveProjectIdentity(
      { path: ZERO_AGENT.workspacePath, name: ZERO_AGENT.id },
      [
        {
          id: 'builtin.project-identity.openbot-agents',
          priority: 10,
          resolve: (project) => resolveOpenBotAgentIdentity(project, buildOpenBotAgentIndex([])),
        },
        {
          id: 'builtin.project-identity.generated-directories',
          priority: 100,
          resolve: resolveGeneratedDirectoryIdentity,
        },
      ],
    )

    expect(identity.label).toBe('Bot da66bdca')
    expect(identity.avatar).toEqual({
      kind: 'emoji',
      value: '🤖',
      hue: hueFor(ZERO_AGENT.workspacePath),
    })
  })
})

describe('activate', () => {
  const fakeContext = (listAgents: () => Promise<unknown>) => {
    const registerProjectIdentityProvider = vi.fn()
    const warn = vi.fn()
    return {
      ctx: {
        psm: { openbot: { listAgents } },
        log: { warn },
        ui: { registerProjectIdentityProvider },
      } as never,
      registerProjectIdentityProvider,
      warn,
    }
  }

  it('registers the agent provider above the directory fallback', async () => {
    const { default: activate, AGENT_PROVIDER_ID, GENERATED_PROVIDER_ID } = await import('./index')
    const { ctx, registerProjectIdentityProvider } = fakeContext(async () => [ZERO_AGENT])

    await activate(ctx)

    expect(registerProjectIdentityProvider).toHaveBeenCalledTimes(2)
    expect(registerProjectIdentityProvider).toHaveBeenNthCalledWith(1, {
      id: AGENT_PROVIDER_ID,
      priority: 10,
      resolve: expect.any(Function),
    })
    expect(registerProjectIdentityProvider).toHaveBeenNthCalledWith(2, {
      id: GENERATED_PROVIDER_ID,
      priority: 100,
      resolve: resolveGeneratedDirectoryIdentity,
    })
  })

  it('keeps working when the host cannot provide agent metadata', async () => {
    const { default: activate, GENERATED_PROVIDER_ID } = await import('./index')
    const { ctx, registerProjectIdentityProvider, warn } = fakeContext(async () => {
      throw new Error('permission denied')
    })

    await activate(ctx)

    expect(warn).toHaveBeenCalledWith(
      'OpenBot agent metadata unavailable; keeping directory names',
      { reason: 'permission denied' },
    )
    expect(registerProjectIdentityProvider).toHaveBeenCalledTimes(1)
    expect(registerProjectIdentityProvider).toHaveBeenCalledWith({
      id: GENERATED_PROVIDER_ID,
      priority: 100,
      resolve: resolveGeneratedDirectoryIdentity,
    })
  })
})
