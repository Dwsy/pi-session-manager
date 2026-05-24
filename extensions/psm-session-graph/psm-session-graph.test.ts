import { describe, expect, it, vi } from 'vitest'

import activate, { manifest } from './index'
import {
  buildSessionGraphTreeForTest,
  compactSessionGraphTreeForTest,
  filterSessionGraphTreeForTest,
  getSessionGraphNodeRoleForTest,
  resolveSessionGraphNavigationForTest,
  summarizeSessionGraphEntryForTest,
} from './SessionGraphView'

describe('psm-session-graph plugin', () => {
  it('builds pi JSONL roots from null/None/orphan parentId and groups forests under a visual root', () => {
    const roots = buildSessionGraphTreeForTest([
      { type: 'message', id: 'm1', parentId: null as any, timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: [] } },
      { type: 'message', id: 'm2', parentId: 'm1', timestamp: '2026-01-01T00:01:00Z', message: { role: 'assistant', content: [] } },
      { type: 'message', id: 'm3', parentId: 'None', timestamp: '2026-01-01T00:02:00Z', message: { role: 'user', content: [] } },
      { type: 'message', id: 'm4', parentId: 'missing-parent', timestamp: '2026-01-01T00:03:00Z', message: { role: 'assistant', content: [] } },
    ])

    expect(roots).toHaveLength(1)
    expect(roots[0].entry).toMatchObject({ id: '__psm_session_root__', type: 'session_root' })
    expect(roots[0].children.map((node) => node.entry.id)).toEqual(['m1', 'm3', 'm4'])
    expect(roots[0].children[0].children.map((node) => node.entry.id)).toEqual(['m2'])
  })

  it('classifies pi JSONL node roles explicitly', () => {
    expect(getSessionGraphNodeRoleForTest({ type: 'message', id: 'u', timestamp: '', message: { role: 'user' } })).toBe('user')
    expect(getSessionGraphNodeRoleForTest({ type: 'message', id: 'a', timestamp: '', message: { role: 'assistant' } })).toBe('assistant')
    expect(getSessionGraphNodeRoleForTest({ type: 'message', id: 'tr', timestamp: '', message: { role: 'toolResult' } })).toBe('toolResult')
    expect(getSessionGraphNodeRoleForTest({ type: 'message', id: 's', timestamp: '', message: { role: 'system' } })).toBe('system')
    expect(getSessionGraphNodeRoleForTest({ type: 'session_info', id: 'si', timestamp: '' })).toBe('session')
    expect(getSessionGraphNodeRoleForTest({ type: 'label', id: 'l', timestamp: '' })).toBe('label')
    expect(getSessionGraphNodeRoleForTest({ type: 'model_change', id: 'm', timestamp: '' })).toBe('model')
    expect(getSessionGraphNodeRoleForTest({ type: 'thinking_level_change', id: 't', timestamp: '' })).toBe('thinking')
    expect(getSessionGraphNodeRoleForTest({ type: 'branch_summary', id: 'b', timestamp: '' })).toBe('branch')
  })

  it('keeps skipped entry ids when compacting low-value flow nodes', () => {
    const roots = buildSessionGraphTreeForTest([
      { type: 'session', id: 's', parentId: null as any, timestamp: '2026-01-01T00:00:00Z' },
      { type: 'thinking_level_change', id: 'think', parentId: 's', timestamp: '2026-01-01T00:00:01Z' },
      { type: 'message', id: 'u', parentId: 'think', timestamp: '2026-01-01T00:00:02Z', message: { role: 'user', content: [] } },
    ])

    const compact = compactSessionGraphTreeForTest(roots, 'all')

    expect(compact[0].entry.id).toBe('u')
    expect(compact[0].skippedIds).toEqual(['s', 'think'])
  })

  it('filters hierarchy by role while preserving ancestor topology', () => {
    const roots = buildSessionGraphTreeForTest([
      { type: 'message', id: 'u', parentId: null as any, timestamp: '2026-01-01T00:00:00Z', message: { role: 'user', content: [] } },
      { type: 'label', id: 'label', parentId: 'u', targetId: 'u', timestamp: '2026-01-01T00:00:01Z' },
      { type: 'branch_summary', id: 'branch', parentId: 'label', timestamp: '2026-01-01T00:00:02Z' },
    ])

    const filtered = filterSessionGraphTreeForTest(roots, 'branch')

    expect(filtered[0].entry.id).toBe('u')
    expect(filtered[0].children[0].entry.id).toBe('label')
    expect(filtered[0].children[0].children[0].entry.id).toBe('branch')
  })

  it('summarizes real pi JSONL entries into human-readable graph cards', () => {
    const user = summarizeSessionGraphEntryForTest({
      type: 'message',
      id: 'user1',
      parentId: null as any,
      timestamp: '2026-01-01T00:00:00Z',
      message: { role: 'user', content: [{ type: 'text', text: 'Please refactor the bash executor and preserve streaming output.' }] },
    })
    const assistant = summarizeSessionGraphEntryForTest({
      type: 'message',
      id: 'assistant1',
      parentId: 'user1',
      timestamp: '2026-01-01T00:00:01Z',
      message: {
        role: 'assistant',
        model: 'claude-opus-4-5',
        stopReason: 'toolUse',
        usage: { totalTokens: 12345, cost: { total: 0.0312 } },
        content: [{ type: 'text', text: 'I will inspect the current implementation first.' }, { type: 'toolCall', id: 'call-1', name: 'read', arguments: { path: 'src/core/bash-executor.ts' } }],
      },
    })
    const tool = summarizeSessionGraphEntryForTest({
      type: 'message',
      id: 'tool1',
      parentId: 'assistant1',
      timestamp: '2026-01-01T00:00:02Z',
      message: { role: 'toolResult', toolCallId: 'call-1', toolName: 'read', content: [{ type: 'text', text: 'class BashExecutor { ... }' }], isError: false },
    })

    expect(user.title).toContain('Please refactor')
    expect(assistant.title).toContain('I will inspect')
    expect(assistant.preview).toContain('Tools: read')
    expect(assistant.meta).toContain('claude-opus-4-5')
    expect(assistant.meta).toContain('12,345 tok')
    expect(tool.title).toBe('read result')
    expect(tool.preview).toContain('BashExecutor')
  })

  it('uses Tree-compatible navigation for label and toolResult nodes', () => {
    const entries = [
      { type: 'message', id: 'assistant', parentId: null as any, timestamp: '2026-01-01T00:00:00Z', message: { role: 'assistant', content: [{ type: 'toolCall', id: 'call-1', name: 'bash' }] } },
      { type: 'message', id: 'result', parentId: 'assistant', timestamp: '2026-01-01T00:00:01Z', message: { role: 'toolResult', toolCallId: 'call-1', content: [] } },
      { type: 'label', id: 'label', parentId: 'result', targetId: 'assistant', timestamp: '2026-01-01T00:00:02Z' },
    ]

    expect(resolveSessionGraphNavigationForTest(entries, 'result')).toEqual({ leafId: 'label', targetId: 'assistant' })
    expect(resolveSessionGraphNavigationForTest(entries, 'label')).toEqual({ leafId: 'label', targetId: 'assistant' })
  })

  it('registers Flow and Hierarchy as optional session tree views', () => {
    const registerSessionTreeView = vi.fn()
    const ctx = {
      ui: {
        registerSessionTreeView,
      },
    }

    activate(ctx as any)

    expect(manifest.id).toBe('builtin.session-graph')
    expect(registerSessionTreeView).toHaveBeenCalledTimes(2)
    expect(registerSessionTreeView.mock.calls.map(([view]) => view.id)).toEqual([
      'builtin.session-graph.flow',
      'builtin.session-graph.hierarchy',
    ])
  })
})
