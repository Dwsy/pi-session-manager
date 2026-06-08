import { describe, expect, it } from 'vitest'

import {
  buildSubagentProviderResolutionOrder,
  providerBadgeLabel,
} from './subagentProviders'

describe('subagentProviders', () => {
  it('prioritizes forced provider before detected provider', () => {
    expect(
      buildSubagentProviderResolutionOrder(
        {
          mode: 'forced',
          forcedProvider: 'HazAT/pi-interactive-subagents',
          showProviderBadge: true,
          enableAsyncStatusProbe: true,
        },
        '@tintinweb/pi-subagents',
      ).slice(0, 3),
    ).toEqual([
      'HazAT/pi-interactive-subagents',
      '@tintinweb/pi-subagents',
      'nicobailon/pi-subagents',
    ])
  })

  it('falls back to detected provider first in smart mode', () => {
    expect(
      buildSubagentProviderResolutionOrder(
        {
          mode: 'smart',
          showProviderBadge: true,
          enableAsyncStatusProbe: true,
        },
        'nicobailon/pi-subagents',
      )[0],
    ).toBe('nicobailon/pi-subagents')
  })

  it('returns stable provider badges', () => {
    expect(providerBadgeLabel('HazAT/pi-interactive-subagents')).toBe('HazAT')
    expect(providerBadgeLabel('nicobailon/pi-subagents')).toBe('nicobailon')
    expect(providerBadgeLabel('@tintinweb/pi-subagents')).toBe('@tintinweb')
    expect(providerBadgeLabel('generic')).toBeNull()
  })
})
