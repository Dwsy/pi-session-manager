import { describe, expect, it } from 'vitest'

import { buildGrokPiTeamTree, parseTeamSidecar } from './team'

describe('grok-pi V2 team index', () => {
  it('keeps the latest snapshot per run and ignores V1-only rows', () => {
    const base = {
      version: 1,
      id: 'run-1',
      agentPath: '/root/worker',
      parentAgentPath: '/root',
      description: 'worker',
      type: 'general-purpose',
      status: 'running',
      startedAt: 10,
      childSessionFile: '/tmp/worker.jsonl',
      agentSessionId: 'pi-worker',
    }
    const rows = parseTeamSidecar([
      JSON.stringify(base),
      JSON.stringify({ ...base, status: 'completed' }),
      JSON.stringify({ ...base, id: 'legacy', agentPath: undefined, parentAgentPath: undefined }),
      '{truncated',
    ].join('\n'))

    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('completed')
  })

  it('builds stable parent/child hierarchy from persisted agent paths', () => {
    const agents = [
      {
        agentPath: '/root/worker/helper', parentAgentPath: '/root/worker', description: 'helper',
        type: 'general-purpose', status: 'running' as const, startedAt: 2,
        childSessionFile: '/tmp/helper.jsonl', agentSessionId: 'pi-helper',
      },
      {
        agentPath: '/root/worker', parentAgentPath: '/root', description: 'worker',
        type: 'general-purpose', status: 'completed' as const, startedAt: 1,
        childSessionFile: '/tmp/worker.jsonl', agentSessionId: 'pi-worker',
      },
    ]

    const tree = buildGrokPiTeamTree(agents)
    expect(tree.map((node) => node.agentPath)).toEqual(['/root/worker'])
    expect(tree[0]?.children.map((node) => node.agentPath)).toEqual(['/root/worker/helper'])
  })

  it('keeps sibling order aligned with spawn time, using path only as a tie-break', () => {
    const agents = [
      {
        agentPath: '/root/a-later', parentAgentPath: '/root', description: 'later',
        type: 'general-purpose', status: 'running' as const, startedAt: 20,
        childSessionFile: '/tmp/later.jsonl', agentSessionId: 'pi-later',
      },
      {
        agentPath: '/root/z-earlier', parentAgentPath: '/root', description: 'earlier',
        type: 'general-purpose', status: 'running' as const, startedAt: 10,
        childSessionFile: '/tmp/earlier.jsonl', agentSessionId: 'pi-earlier',
      },
    ]

    expect(buildGrokPiTeamTree(agents).map((node) => node.agentPath)).toEqual([
      '/root/z-earlier',
      '/root/a-later',
    ])
  })
})
