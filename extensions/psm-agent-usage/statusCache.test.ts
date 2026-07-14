import { describe, expect, it } from 'vitest'

import { normalizeCachedStatus } from './statusCache'

describe('agent usage status cache', () => {
  it('reads v1 cache envelope', () => {
    const status = {
      providers: [],
      fetchedAt: '2026-07-13T00:00:00.000Z',
    }
    expect(
      normalizeCachedStatus({
        version: 1,
        savedAt: '2026-07-13T00:00:00.000Z',
        status,
      }),
    ).toEqual(status)
  })

  it('imports legacy muxy snapshots shape', () => {
    const next = normalizeCachedStatus({
      version: 1,
      displayMode: 'used',
      snapshots: [
        {
          id: 'grok',
          name: 'Grok',
          icon: 'grok',
          fetchedAt: '2026-07-13T07:50:12.422Z',
          state: { kind: 'available' },
          rows: [{ id: 'Weekly', label: 'Weekly limit', percent: 12.5, resetAt: null, detail: null }],
          planName: 'X Premium+',
        },
      ],
    })
    expect(next?.providers).toHaveLength(1)
    expect(next?.providers[0]?.id).toBe('grok')
    expect(next?.providers[0]?.state).toBe('available')
    expect(next?.providers[0]?.metrics[0]?.usedPercent).toBe(12.5)
  })
})