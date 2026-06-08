import { describe, expect, it } from 'vitest'

import { resolveSubagentToolState } from './toolAdapter'

describe('resolveSubagentToolState', () => {
  const smartSettings = {
    mode: 'smart' as const,
    showProviderBadge: true,
    enableAsyncStatusProbe: true,
  }

  it('prefers HazAT started payload in smart mode', () => {
    const state = resolveSubagentToolState({
      settings: smartSettings,
      details: {
        status: 'started',
        name: 'Scout',
        task: 'Inspect auth flow',
        sessionFile: '/tmp/scout.jsonl',
        agent: 'scout',
      },
      args: {},
      output: '',
    })

    expect(state.kind).toBe('hazat-started')
    if (state.kind === 'hazat-started') {
      expect(state.providerBadge).toBe('HazAT')
      expect(state.details.sessionFile).toBe('/tmp/scout.jsonl')
    }
  })

  it('prefers nicobailon async payload in smart mode', () => {
    const state = resolveSubagentToolState({
      settings: smartSettings,
      details: {
        mode: 'parallel',
        results: [],
        asyncId: 'run-1',
        asyncDir: '/tmp/run-1',
      },
      args: { task: 'Run review' },
      output: '',
    })

    expect(state.kind).toBe('nicobailon-started')
    if (state.kind === 'nicobailon-started') {
      expect(state.providerBadge).toBe('nicobailon')
      expect(state.taskText).toBe('Run review')
    }
  })

  it('keeps tintinweb rendering available as safe fallback in forced mode', () => {
    const state = resolveSubagentToolState({
      settings: {
        mode: 'forced',
        forcedProvider: 'HazAT/pi-interactive-subagents',
        showProviderBadge: true,
        enableAsyncStatusProbe: true,
      },
      details: {
        displayName: 'Explore',
        description: 'Find files',
        subagentType: 'Explore',
        toolUses: 2,
        tokens: '1.2k',
        durationMs: 1200,
        status: 'completed',
      },
      args: {},
      output: 'Found files',
    })

    expect(state.kind).toBe('tintinweb')
  })

  it('falls back to generic pending state for unknown payloads', () => {
    const state = resolveSubagentToolState({
      settings: smartSettings,
      details: undefined,
      args: { agent: 'worker', task: 'Implement fix' },
      output: '',
    })

    expect(state.kind).toBe('pending')
    if (state.kind === 'pending') {
      expect(state.isPending).toBe(true)
      expect(state.agentName).toBe('worker')
    }
  })
})
