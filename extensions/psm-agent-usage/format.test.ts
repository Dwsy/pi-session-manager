import { describe, expect, it } from 'vitest'

import { formatPercent, metricTone, providerSummary, sortProviders } from './format'
import type { PsmAgentUsageProvider } from '@pi-session-manager/plugin-sdk'

function provider(partial: Partial<PsmAgentUsageProvider> & Pick<PsmAgentUsageProvider, 'id' | 'name' | 'state'>): PsmAgentUsageProvider {
  return {
    fetchedAt: '2026-07-13T00:00:00Z',
    metrics: [],
    ...partial,
  }
}

describe('agent usage format helpers', () => {
  it('formats percents and metric tones', () => {
    expect(formatPercent(12.34)).toBe('12%')
    expect(formatPercent(null)).toBe('—')
    expect(metricTone({ label: '5h', usedPercent: 92 })).toBe('critical')
    expect(metricTone({ label: '5h', usedPercent: 80 })).toBe('warn')
    expect(metricTone({ label: '5h', usedPercent: 20 })).toBe('ok')
  })

  it('sorts available high-usage providers first', () => {
    const sorted = sortProviders([
      provider({ id: 'a', name: 'A', state: 'unavailable' }),
      provider({
        id: 'b',
        name: 'B',
        state: 'available',
        metrics: [{ label: '5h', usedPercent: 20 }],
      }),
      provider({
        id: 'c',
        name: 'C',
        state: 'available',
        metrics: [{ label: '5h', usedPercent: 90 }],
      }),
    ])
    expect(sorted.map((item) => item.id)).toEqual(['c', 'b', 'a'])
  })

  it('summarizes provider rows', () => {
    expect(providerSummary(provider({
      id: 'claude',
      name: 'Claude Code',
      state: 'available',
      metrics: [
        { label: '7d', usedPercent: 10 },
        { label: '5h', usedPercent: 42 },
      ],
    }))).toBe('5h 42%')
  })
})
