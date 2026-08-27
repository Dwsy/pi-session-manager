import { describe, expect, it } from 'vitest'
import type { PsmToolResolvedData } from '@pi-session-manager/plugin-sdk'

import { resolveGrokPiToolPresentation, transformGrokPiEntries } from './protocol'

function tool(name: string, args: Record<string, unknown>, details?: Record<string, unknown>): PsmToolResolvedData {
  return {
    name,
    args,
    toolCallId: 'call-1',
    entryId: 'result-1',
    output: '',
    isError: false,
    result: details ? {
      type: 'message',
      id: 'result-1',
      message: { role: 'toolResult', details },
    } : undefined,
  }
}

describe('resolveGrokPiToolPresentation', () => {
  it('detects Eval v2 and background state', () => {
    expect(resolveGrokPiToolPresentation(tool('eval', {
      language: 'js',
      code: 'await tool.read({ path: "README.md" })',
      title: 'Read docs',
    }, { bridgeVersion: 'v2', background: true, language: 'js' }))).toMatchObject({
      kind: 'eval',
      title: 'Eval v2',
      primaryText: 'Read docs',
      version: 'v2',
      background: true,
    })
  })

  it('distinguishes Todo v1 and v2', () => {
    expect(resolveGrokPiToolPresentation(tool('todo', { todos: [{ id: 'one' }] }, { version: 1 })).version).toBe('v1')
    expect(resolveGrokPiToolPresentation(tool('todo', { action: 'create', subject: 'Ship renderer' }, { version: 2 })).version).toBe('v2')
  })

  it('distinguishes Subagents v1 and v2 tools', () => {
    expect(resolveGrokPiToolPresentation(tool('spawn_subagent', { description: 'Inspect protocol' })).version).toBe('v1')
    expect(resolveGrokPiToolPresentation(tool('spawn_team_agent', { task_name: 'reviewer' })).version).toBe('v2')
  })
})

describe('transformGrokPiEntries', () => {
  it('renders recap durable entries through the custom-message pipeline', () => {
    const [entry] = transformGrokPiEntries([{
      type: 'custom',
      id: 'recap-1',
      customType: 'pi-grok-recap/v1',
      data: { version: 1, ok: true, summary: '## Current state' },
    }]) as Array<Record<string, unknown>>

    expect(entry).toMatchObject({
      type: 'custom_message',
      customType: 'Grok Pi Recap',
      content: '## Current state',
    })
  })

  it('hides BTW stream traffic and renders the durable history answer', () => {
    const entries = transformGrokPiEntries([
      {
        type: 'custom',
        id: 'delta-1',
        customType: 'pi-grok-btw/v1',
        data: { version: 1, ok: true, phase: 'delta', delta: 'partial' },
      },
      {
        type: 'custom',
        id: 'history-1',
        customType: 'pi-grok-btw/history/v1',
        data: { version: 1, question: 'Why?', answer: 'Because.', modelUsed: 'xai::grok' },
      },
    ]) as Array<Record<string, unknown>>

    expect(entries[0].type).toBe('custom')
    expect(entries[1]).toMatchObject({
      type: 'custom_message',
      customType: 'Grok Pi BTW',
    })
    expect(String(entries[1].content)).toContain('**Question**')
    expect(String(entries[1].content)).toContain('Because.')
  })

  it('renders persisted subagent state', () => {
    const [entry] = transformGrokPiEntries([{
      type: 'custom',
      id: 'agent-1',
      customType: 'pi-grok-subagent-state/v1',
      data: { status: 'completed', description: 'Protocol review', turnCount: 2, toolCallCount: 3 },
    }]) as Array<Record<string, unknown>>

    expect(entry).toMatchObject({
      type: 'custom_message',
      customType: 'Grok Pi Subagent State',
    })
    expect(String(entry.content)).toContain('Subagent COMPLETED')
    expect(String(entry.content)).toContain('2 turns · 3 tools')
  })
})
