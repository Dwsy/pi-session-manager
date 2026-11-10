import { cachedBloubAvatarDataUrl } from './bloubAvatar'
import type {
  PsmOpenBotAgent,
  PsmProjectIdentity,
  PsmProjectIdentityAvatar,
  PsmProjectReference,
} from '@dwsy/plugin-sdk'

const AGENT_DIRECTORY =
  /^agent-([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROFILE_DIRECTORY = /^openbot-profile-([a-z0-9]+)$/i

export const OPENBOT_AGENT_SUBTITLE = 'OpenBot agent'

/** Stable hue so the same directory always keeps the same color across restarts. */
export function hueFor(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash) % 360
}

/**
 * Shortens machine-generated workspace directories that would otherwise be truncated
 * in the sidebar, e.g. `agent-da66bdca-0664-440c-a271-585ab5c62164` to `Bot da66bdca`.
 *
 * Returns `null` for ordinary directories so the host keeps its default label.
 */
export function resolveGeneratedDirectoryIdentity(
  project: PsmProjectReference,
): PsmProjectIdentity | null {
  const agent = AGENT_DIRECTORY.exec(project.name)
  if (agent) {
    return {
      label: `Bot ${agent[1].toLowerCase()}`,
      avatar: { kind: 'emoji', value: '🤖', hue: hueFor(project.path) },
      hidePath: true,
    }
  }

  const profile = PROFILE_DIRECTORY.exec(project.name)
  if (profile) {
    return {
      label: `Profile ${profile[1].toUpperCase()}`,
      avatar: { kind: 'emoji', value: '🧩', hue: hueFor(project.path) },
      hidePath: true,
    }
  }

  return null
}

/** Case/separator-insensitive key, because workspace paths differ across platforms. */
function pathKey(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export interface OpenBotAgentIndex {
  byPath: Map<string, PsmOpenBotAgent>
  byId: Map<string, PsmOpenBotAgent>
}

export function buildOpenBotAgentIndex(agents: readonly PsmOpenBotAgent[]): OpenBotAgentIndex {
  const byPath = new Map<string, PsmOpenBotAgent>()
  const byId = new Map<string, PsmOpenBotAgent>()
  for (const agent of agents) {
    if (!agent || typeof agent.id !== 'string' || typeof agent.name !== 'string') continue
    if (!agent.id.trim() || !agent.name.trim()) continue
    byId.set(agent.id.trim().toLowerCase(), agent)
    if (agent.workspacePath && agent.workspacePath.trim()) {
      byPath.set(pathKey(agent.workspacePath), agent)
    }
  }
  return { byPath, byId }
}

function agentHue(agent: PsmOpenBotAgent): number | null {
  return typeof agent.avatarHue === 'number' && Number.isFinite(agent.avatarHue)
    ? agent.avatarHue
    : null
}

/**
 * OpenBot stores no avatar image for generated bots: it stores `avatarSeed` and renders
 * the face with @norbert_bodziony/bloub. We reproduce that drawing, so an agent without
 * a seed only falls back to its initial.
 */
function agentAvatar(agent: PsmOpenBotAgent): PsmProjectIdentityAvatar {
  const avatarUrl = agent.avatarUrl?.trim()
  if (avatarUrl && /^https:/i.test(avatarUrl)) {
    return { kind: 'url', value: avatarUrl }
  }

  const seed = agent.avatarSeed?.trim()
  if (seed) {
    try {
      return { kind: 'url', value: cachedBloubAvatarDataUrl(seed, agentHue(agent)) }
    } catch {
      // Fall through to the initial so a drawing failure never hides the agent.
    }
  }

  return {
    kind: 'initial',
    value: agent.name.trim().slice(0, 1).toUpperCase(),
    hue: agentHue(agent) ?? hueFor(agent.id),
  }
}

/**
 * Resolves an OpenBot agent workspace directory to its real bot name and avatar.
 * Matches the exact workspace path first, then the directory id, so sessions created
 * before an agent was renamed still resolve.
 */
export function resolveOpenBotAgentIdentity(
  project: PsmProjectReference,
  index: OpenBotAgentIndex,
): PsmProjectIdentity | null {
  const agent =
    index.byPath.get(pathKey(project.path)) ??
    index.byId.get(project.name.trim().toLowerCase())
  if (!agent) return null

  const title = agent.title?.trim()
  return {
    label: agent.name.trim(),
    subtitle: title && title !== agent.name.trim() ? title : OPENBOT_AGENT_SUBTITLE,
    avatar: agentAvatar(agent),
    hidePath: true,
  }
}
