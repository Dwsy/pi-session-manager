import { describe, expect, it } from 'vitest'

import { resolveSubagentCustomMessage } from './subagentCustomMessage'

describe('resolveSubagentCustomMessage', () => {
  it('parses HazAT subagent_result details into canonical notification', () => {
    const resolved = resolveSubagentCustomMessage({
      customType: 'subagent_result',
      content: 'Sub-agent "Scout" completed (45s).\n\nFound auth files.\n\nSession: /tmp/scout.jsonl',
      details: {
        name: 'Scout',
        task: 'Analyze auth module',
        agent: 'scout',
        exitCode: 0,
        elapsed: 45,
        sessionFile: '/tmp/scout.jsonl',
      },
      settings: {
        mode: 'smart',
        showProviderBadge: true,
        enableAsyncStatusProbe: true,
      },
    })

    expect(resolved).toMatchObject({
      provider: 'HazAT/pi-interactive-subagents',
      title: 'Scout',
      task: 'Analyze auth module',
      status: 'completed',
      sessionFile: '/tmp/scout.jsonl',
      durationMs: 45000,
      providerBadge: 'HazAT',
    })
    expect(resolved?.summary).toContain('Found auth files')
  })

  it('parses nicobailon subagent-notify content into canonical notification', () => {
    const resolved = resolveSubagentCustomMessage({
      customType: 'subagent-notify',
      content: [
        'Background task completed: **reviewer** (1/3)',
        '',
        'Reviewed the diff and found no blocking issues.',
        '',
        'Session file: /tmp/reviewer.jsonl',
      ].join('\n'),
      settings: {
        mode: 'smart',
        showProviderBadge: true,
        enableAsyncStatusProbe: true,
      },
    })

    expect(resolved).toMatchObject({
      provider: 'nicobailon/pi-subagents',
      title: 'reviewer',
      status: 'completed',
      sessionFile: '/tmp/reviewer.jsonl',
      providerBadge: 'nicobailon',
    })
    expect(resolved?.summary).toContain('Reviewed the diff')
  })

  it('returns null for unrelated custom messages', () => {
    expect(
      resolveSubagentCustomMessage({
        customType: 'quality_gate',
        content: { ok: true },
        settings: {
          mode: 'smart',
          showProviderBadge: true,
          enableAsyncStatusProbe: true,
        },
      }),
    ).toBeNull()
  })
})
