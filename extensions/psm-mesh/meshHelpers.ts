import type { PsmMeshPeer } from '@dwsy/plugin-sdk'
import type { SessionInfo } from '@/types'
import { getSessionSourceSlug } from '@/utils/session'

export const MESH_PEER_PAGE_SIZE = 40

export function pageMeshPeers<T>(peers: T[], visibleLimit: number): T[] {
  return peers.slice(0, Math.max(0, Math.floor(visibleLimit)))
}

export type MeshPeerStatus = 'running' | 'idle' | 'offline' | 'closed'

export interface MeshPeer {
  id: string
  title: string
  cwd: string
  session: SessionInfo | null
  mesh: PsmMeshPeer | null
  status: MeshPeerStatus
  isEphemeral: boolean
  persistence: 'file' | 'memory' | 'unknown'
  indexed: boolean
  repoName: string
  branch?: string | null
  lastFile?: { op: 'write' | 'edit'; path: string; ts: string }
}

export function normalizePiSessionId(value: string | null | undefined): string {
  if (!value) return ''
  const normalized = value.trim().replace(/^pi:/i, '')
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized.toLowerCase() : ''
}

function sessionTitle(session: SessionInfo, cwd: string): string {
  const explicit = session.name?.trim()
  if (explicit) return explicit

  const firstMessage = session.first_message?.split(/\r?\n/, 1)[0]?.trim()
  if (firstMessage) return firstMessage.slice(0, 72)

  const segments = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  return segments[segments.length - 1] ?? session.id
}

export function mergeMeshPeers(
  sessions: SessionInfo[],
  meshPeers: PsmMeshPeer[],
): MeshPeer[] {
  const piSessions = sessions.filter((session) => getSessionSourceSlug(session.path) === 'pi')
  const pathCounts = new Map<string, number>()
  const idCounts = new Map<string, number>()
  for (const session of piSessions) {
    pathCounts.set(session.path, (pathCounts.get(session.path) ?? 0) + 1)
    const id = normalizePiSessionId(session.id)
    if (id) idCounts.set(id, (idCounts.get(id) ?? 0) + 1)
  }
  const meshIdCounts = new Map<string, number>()
  for (const peer of meshPeers) {
    const id = normalizePiSessionId(peer.sessionId)
    if (id) meshIdCounts.set(id, (meshIdCounts.get(id) ?? 0) + 1)
  }
  const used = new Set<PsmMeshPeer>()
  const statusOf = (peer: PsmMeshPeer | null): MeshPeerStatus => {
    if (!peer) return 'offline'
    return peer.state === 'waiting' ? 'idle' : peer.state
  }
  const peers: MeshPeer[] = piSessions.map((session) => {
    const sessionId = normalizePiSessionId(session.id)
    const matches = meshPeers.filter((peer) => {
      if (peer.persistence ? peer.persistence === 'memory' : peer.ephemeral === true) return false
      const peerId = normalizePiSessionId(peer.sessionId)
      if (!peerId || peerId !== sessionId || meshIdCounts.get(peerId) !== 1 || idCounts.get(sessionId) !== 1) return false
      // A contradictory path is not repaired by UUID fallback.
      if (peer.sessionFile) return peer.sessionFile === session.path && pathCounts.get(session.path) === 1
      return true
    })
    const mesh = matches.length === 1 ? matches[0] : null
    if (mesh) used.add(mesh)
    const cwd = mesh?.cwd || session.cwd
    const repoName = basenameForDisplay(mesh?.git?.repoRoot || cwd || 'Unknown')
    const branch = mesh?.git?.branch
    const lastFile = mesh?.files && mesh.files.length > 0 ? mesh.files[mesh.files.length - 1] : undefined

    return {
      id: session.path,
      title: sessionTitle(session, cwd),
      cwd,
      session,
      mesh,
      status: statusOf(mesh),
      isEphemeral: false,
      persistence: 'file',
      indexed: true,
      repoName,
      branch,
      lastFile,
    }
  })

  const unlinkedPeers = meshPeers
    .filter((peer) => !used.has(peer))
    .slice()
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.sessionId.localeCompare(right.sessionId))

  for (const mesh of unlinkedPeers) {
    const cwd = mesh.cwd ?? ''
    const persistence = mesh.persistence ?? (mesh.ephemeral ? 'memory' : 'unknown')
    const repoName = basenameForDisplay(mesh.git?.repoRoot || cwd || 'Memory')
    const branch = mesh.git?.branch
    const lastFile = mesh.files && mesh.files.length > 0 ? mesh.files[mesh.files.length - 1] : undefined

    peers.push({
      id: `mesh:${mesh.machineId}:${mesh.sessionId}:${mesh.pid}:${mesh.startedAt}`, 
      title: sessionTitle({
        path: mesh.sessionFile ?? '',
        id: mesh.sessionId,
        cwd,
        created: '',
        modified: '',
        message_count: 0,
        first_message: '',
        last_message: '',
        last_message_role: '',
      }, cwd) || mesh.title || mesh.sessionId,
      cwd,
      session: null,
      mesh,
      status: statusOf(mesh),
      isEphemeral: persistence === 'memory',
      persistence,
      indexed: false,
      repoName,
      branch,
      lastFile,
    })
  }

  return peers
}

export function isFavoritePeer(peer: MeshPeer, favoriteIds: Set<string>): boolean {
  if (!peer.session) return false
  return favoriteIds.has(peer.session.id) || favoriteIds.has(peer.session.path)
}

export function favoriteIdsFromItems(
  items: Array<{ type: string; id: string; path: string }>,
): Set<string> {
  const ids = new Set<string>()
  for (const item of items) {
    if (item.type !== 'session') continue
    ids.add(item.id)
    ids.add(item.path)
  }
  return ids
}

export function basenameForDisplay(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return segments[segments.length - 1] ?? path
}

/** Full paths keep equally named repositories in different workspaces distinct. */
export function meshRepoKey(peer: MeshPeer): string {
  return peer.mesh?.git?.repoRoot || peer.cwd || peer.repoName
}
