import { describe, expect, it } from 'vitest'
import { mergeMeshPeers, meshRepoKey } from './meshHelpers'
import type { PsmMeshPeer } from '@dwsy/plugin-sdk'
import type { SessionInfo } from '@/types'
import { filterMeshPeers, meshActivityTimestamp, meshDisplayStatus, meshFilterCounts } from './meshUi'

const sessions: SessionInfo[] = [
  { id: '11111111-1111-4111-8111-111111111111', path: '/demo/.pi/agent/sessions/online.jsonl', cwd: '/work/client/app', name: 'Online invoice', created: '', modified: '2026-11-03T02:00:00Z', message_count: 1, first_message: '', last_message: '', last_message_role: '' },
  { id: '22222222-2222-4222-8222-222222222222', path: '/demo/.pi/agent/sessions/offline.jsonl', cwd: '/work/server/app', name: 'Offline invoice', created: '', modified: '2026-11-03T03:00:00Z', message_count: 1, first_message: '', last_message: '', last_message_role: '' },
]
const live: PsmMeshPeer = {
  sessionId: sessions[0].id, sessionFile: sessions[0].path, cwd: sessions[0].cwd, pid: 1, machineId: 'test',
  state: 'running', startedAt: '2026-11-01T00:00:00Z', lastHeartbeat: '', files: [], following: [],
  git: { repoRoot: sessions[0].cwd, branch: 'main', commonRoot: null, worktree: 'main' },
}
const peers = () => mergeMeshPeers(sessions, [live])
describe('Mesh filter and presentation semantics', () => {
  it('applies search inside the chosen status and can widen scope without losing the query', () => {
    const options = { query: 'offline invoice', repo: null, filter: 'online' as const, available: true, favoriteIds: new Set<string>() }
    expect(filterMeshPeers(peers(), options)).toEqual([])
    expect(filterMeshPeers(peers(), { ...options, filter: 'all' }).map((p) => p.title)).toEqual(['Offline invoice'])
  })
  it('distinguishes equally named repositories and counts favorites inside the selected scope', () => {
    const items = peers()
    expect(items.map(meshRepoKey)).toEqual(['/work/client/app', '/work/server/app'])
    const favoriteIds = new Set([sessions[1].id])
    const result = filterMeshPeers(items, { query: 'invoice', repo: '/work/server/app', filter: 'favorites', available: true, favoriteIds })
    expect(result.map((p) => p.title)).toEqual(['Offline invoice'])
    expect(meshFilterCounts(result, true, favoriteIds)).toEqual({ all: 1, online: 0, running: 0, idle: 0, offline: 1, favorites: 1 })
  })
  it('moves closed and disconnected peers into history consistently', () => {
    const items = peers()
    expect(meshDisplayStatus(items[0], false)).toBe('offline')
    expect(meshFilterCounts(items, false, new Set())).toMatchObject({ all: 2, online: 0, running: 0, offline: 2 })
    expect(meshDisplayStatus({ ...items[0], status: 'closed' }, true)).toBe('offline')
  })
  it('shows activity time rather than how long the session process has existed', () => {
    const peer = peers()[0]
    expect(meshActivityTimestamp(peer)).toBe(sessions[0].modified)
    expect(meshActivityTimestamp({ ...peer, lastFile: { op: 'edit', path: '/src/app.ts', ts: '2026-11-03T03:15:00Z' } })).toBe('2026-11-03T03:15:00Z')
  })
})
