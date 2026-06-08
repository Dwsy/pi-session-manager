import { describe, expect, it } from 'vitest'

import {
  detectConfiguredSubagentProviders,
  detectSubagentProviderFromPayload,
  normalizeSubagentCompatibilitySettings,
} from './subagentCompatibility'

describe('subagentCompatibility', () => {
  it('defaults to smart mode when config is missing', () => {
    expect(normalizeSubagentCompatibilitySettings(undefined)).toMatchObject({
      mode: 'smart',
      showProviderBadge: true,
      enableAsyncStatusProbe: true,
    })
  })

  it('keeps forced provider only in forced mode', () => {
    expect(
      normalizeSubagentCompatibilitySettings({
        mode: 'forced',
        forcedProvider: 'HazAT/pi-interactive-subagents',
        showProviderBadge: false,
        enableAsyncStatusProbe: false,
      }),
    ).toMatchObject({
      mode: 'forced',
      forcedProvider: 'HazAT/pi-interactive-subagents',
      showProviderBadge: false,
      enableAsyncStatusProbe: false,
    })

    expect(
      normalizeSubagentCompatibilitySettings({
        mode: 'smart',
        forcedProvider: 'HazAT/pi-interactive-subagents',
      }),
    ).toMatchObject({
      mode: 'smart',
      forcedProvider: undefined,
    })
  })

  it('detects HazAT payloads from started details and custom message type', () => {
    expect(
      detectSubagentProviderFromPayload({
        details: {
          status: 'started',
          name: 'Scout',
          task: 'inspect auth',
          sessionFile: '/tmp/scout.jsonl',
        },
      }),
    ).toBe('HazAT/pi-interactive-subagents')

    expect(
      detectSubagentProviderFromPayload({
        customType: 'subagent_result',
      }),
    ).toBe('HazAT/pi-interactive-subagents')
  })

  it('detects nicobailon payloads from async details and notify custom type', () => {
    expect(
      detectSubagentProviderFromPayload({
        details: {
          mode: 'chain',
          results: [],
          asyncId: 'run-123',
          asyncDir: '/tmp/async-run',
        },
      }),
    ).toBe('nicobailon/pi-subagents')

    expect(
      detectSubagentProviderFromPayload({
        customType: 'subagent-notify',
      }),
    ).toBe('nicobailon/pi-subagents')
  })

  it('detects tintinweb payloads from displayName/subagentType/status details', () => {
    expect(
      detectSubagentProviderFromPayload({
        details: {
          displayName: 'Explore',
          subagentType: 'Explore',
          status: 'completed',
        },
      }),
    ).toBe('@tintinweb/pi-subagents')
  })

  it('detects enabled and disabled providers from Pi settings packages', () => {
    const summary = detectConfiguredSubagentProviders({
      packages: [
        {
          source: 'npm:@tintinweb/pi-subagents',
          extensions: ['+src/index.ts'],
        },
        {
          source: 'https://github.com/nicobailon/pi-subagents',
          extensions: ['-src/extension/index.ts'],
        },
        '-git:github.com/HazAT/pi-interactive-subagents',
      ],
      extensions: [],
      skills: [],
      prompts: [],
      themes: [],
    })

    expect(summary.enabledProviders).toEqual(['@tintinweb/pi-subagents'])
    expect(summary.disabledProviders).toEqual([
      'nicobailon/pi-subagents',
      'HazAT/pi-interactive-subagents',
    ])
    expect(summary.recommendedProvider).toBe('@tintinweb/pi-subagents')
  })
})
