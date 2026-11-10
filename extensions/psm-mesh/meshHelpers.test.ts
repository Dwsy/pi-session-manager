import { describe, expect, it } from 'vitest'
import type { PsmMeshPeer } from '@dwsy/plugin-sdk'
import type { SessionInfo } from '@/types'
import {
  favoriteIdsFromItems,
  mergeMeshPeers,
  MESH_PEER_PAGE_SIZE,
  pageMeshPeers,
  normalizePiSessionId,
} from './meshHelpers'

function session(id: string, path: string, cwd: string, name = id): SessionInfo {
  return {
    id,
    path,
    cwd,
    name,
    created: '2026-11-01T10:00:00Z',
    modified: '2026-11-01T11:00:00Z',
    message_count: 12,
    first_message: `Work on ${name}`,
    last_message: 'Done',
    last_message_role: 'assistant',
  }
}

function liveAgent(
  sessionId: string,
  values: Partial<PsmMeshPeer> = {},
): PsmMeshPeer {
  return {
    sessionId,
    sessionFile: '',
    pid: 100,
    cwd: '/repo',
    state: 'waiting',
    machineId: 'test-machine',
    startedAt: '2026-11-01T10:00:00Z',
    lastHeartbeat: '2026-11-01T11:00:00Z',
    git: { repoRoot: '/repo', branch: 'main', worktree: 'main', commonRoot: '/repo' },
    files: [],
    following: [],
    ...values,
  }
}

describe('PSM Mesh peer mapping', () => {
  it('caps the PSM history list to a bounded page without losing later results or their ordering', () => {
    const many = Array.from({ length: 95 }, (_, index) => index)
    expect(MESH_PEER_PAGE_SIZE).toBe(40)
    expect(pageMeshPeers(many, MESH_PEER_PAGE_SIZE)).toEqual(many.slice(0, 40))
    expect(pageMeshPeers(many, MESH_PEER_PAGE_SIZE * 2)).toEqual(many.slice(0, 80))
    expect(pageMeshPeers(many, 120)).toEqual(many)
    expect(pageMeshPeers(many, 0)).toEqual([])
  })
  it('rejects double registrations of one full UUID instead of arbitrarily binding either peer', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const entry = session(id, '/Users/test/.pi/agent/sessions/2026/11/02/peer.jsonl', '/repo')
    const a = liveAgent(id, { sessionFile: entry.path, machineId: 'a' })
    const b = liveAgent(id, { sessionFile: entry.path, machineId: 'b' })
    const result = mergeMeshPeers([entry], [a, b])
    expect(result).toHaveLength(3)
    expect(result[0]).toMatchObject({ indexed: true, status: 'offline', mesh: null })
    expect(result.slice(1).every((peer) => peer.indexed === false)).toBe(true)
  })

  it('does not repair a contradictory session path via UUID, even when working directory matches', () => {
    const id = '22222222-2222-4222-8222-222222222222'
    const entry = session(id, '/Users/test/.pi/agent/sessions/2026/11/02/a.jsonl', '/repo')
    const peer = liveAgent(id, { sessionFile: '/Users/test/.pi/agent/sessions/2026/11/02/b.jsonl', cwd: '/repo' })
    const result = mergeMeshPeers([entry], [peer])
    expect(result[0]).toMatchObject({ mesh: null, status: 'offline' })
    expect(result[1].mesh).toBe(peer)
  })

  it('keeps --no-session memory peers separate even if their UUID/path accidentally resembles a saved session', () => {
    const id = '33333333-3333-4333-8333-333333333333'
    const entry = session(id, '/Users/test/.pi/agent/sessions/2026/11/02/a.jsonl', '/repo')
    const peer = liveAgent(id, { sessionFile: entry.path, persistence: 'memory', ephemeral: true })
    const result = mergeMeshPeers([entry], [peer])
    expect(result[0].mesh).toBe(null)
    expect(result[1]).toMatchObject({ indexed: false, isEphemeral: true, persistence: 'memory' })
  })
  it('joins live agents to persisted Pi sessions by exact session path', () => {
    const persisted = session(
      '8d8f53ce-4a52-49c8-98e0-4d7f92dd2d16',
      '/Users/test/.pi/agent/sessions/2026/11/01/session.jsonl',
      '/repo',
      'Build the app',
    )
    const live = liveAgent('pi:8d8f53ce-4a52-49c8-98e0-4d7f92dd2d16', {
      sessionFile: persisted.path,
      state: 'running',
    })

    const peers = mergeMeshPeers([persisted], [live])

    expect(peers).toHaveLength(1)
    expect(peers[0]).toMatchObject({
      id: persisted.path,
      title: 'Build the app',
      status: 'running',
      isEphemeral: false,
    })
    expect(peers[0].session).toBe(persisted)
    expect(peers[0].mesh).toBe(live)
  })

  it('falls back to normalized Pi session UUID when the live path is missing', () => {
    const persisted = session(
      'f8a4f1a7-c3f9-47d6-9c82-82c5e321b9f4',
      '/Users/test/.pi/agent/sessions/2026/11/01/another.jsonl',
      '/repo',
    )
    const live = liveAgent('pi:f8a4f1a7-c3f9-47d6-9c82-82c5e321b9f4')

    expect(mergeMeshPeers([persisted], [live])[0].mesh).toBe(live)
  })

  it('does not join unrelated sessions just because their cwd matches', () => {
    const persisted = session(
      '0d4d1e91-7c0e-4d4d-a2b0-13f4f95bbf43',
      '/Users/test/.pi/agent/sessions/2026/11/01/persisted.jsonl',
      '/same-repo',
    )
    const live = liveAgent('pi:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
      sessionFile: '',
      cwd: '/same-repo',
    })

    const peers = mergeMeshPeers([persisted], [live])

    expect(peers).toHaveLength(2)
    expect(peers[0].status).toBe('offline')
    expect(peers[1]).toMatchObject({ status: 'idle', isEphemeral: false, persistence: 'unknown', indexed: false })
  })

  it('filters non-Pi sessions and preserves the host session order', () => {
    const first = session(
      '11111111-1111-4111-8111-111111111111',
      '/Users/test/.pi/agent/sessions/2026/11/01/first.jsonl',
      '/repo/first',
    )
    const second = session(
      '22222222-2222-4222-8222-222222222222',
      '/Users/test/.pi/agent/sessions/2026/11/01/second.jsonl',
      '/repo/second',
    )
    const claude = session(
      '33333333-3333-4333-8333-333333333333',
      '/Users/test/.claude/projects/demo/session.jsonl',
      '/repo/claude',
    )

    const peers = mergeMeshPeers([second, claude, first], [])

    expect(peers.map((peer) => peer.session?.id)).toEqual([second.id, first.id])
    expect(peers.every((peer) => peer.status === 'offline')).toBe(true)
  })

  it('normalizes the pi prefix and UUID case', () => {
    expect(normalizePiSessionId('pi:8D8F53CE-4A52-49C8-98E0-4D7F92DD2D16'))
      .toBe('8d8f53ce-4a52-49c8-98e0-4d7f92dd2d16')
  })

  it('extracts only session favorites', () => {
    const ids = favoriteIdsFromItems([
      { type: 'session', id: 'session-id', path: '/session.jsonl' },
      { type: 'project', id: 'project-id', path: '/repo' },
    ])

    expect(ids.has('session-id')).toBe(true)
    expect(ids.has('/session.jsonl')).toBe(true)
    expect(ids.has('project-id')).toBe(false)
  })
})
