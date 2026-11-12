import { describe, expect, it } from 'vitest'
import type { Content, SessionEntry } from '@/types'
import { buildToolUsageRows, countToolCalls, filterToolUsageRows } from './system-prompt'

function entry(role: string, content: Content[], id: string): SessionEntry {
  return {
    type: 'message',
    id,
    timestamp: '2026-01-01T00:00:00.000Z',
    message: { role, content },
  }
}

describe('countToolCalls', () => {
  it('counts toolCall blocks on assistant messages only', () => {
    const entries = [
      entry('assistant', [
        { type: 'toolCall', name: 'read', id: 'call-1' },
        { type: 'toolCall', name: 'bash', id: 'call-2' },
      ], 'a1'),
      entry('assistant', [
        { type: 'text', text: 'done' },
        { type: 'toolCall', name: 'read', id: 'call-3' },
      ], 'a2'),
      entry('user', [{ type: 'toolCall', name: 'ignored', id: 'call-4' }], 'u1'),
      entry('toolResult', [{ type: 'text', text: 'ok' }], 't1'),
      entry('assistant', [{ type: 'toolCall', id: 'call-5' }], 'a3'),
    ]

    const counts = countToolCalls(entries)
    expect([...counts.entries()]).toEqual([
      ['read', 2],
      ['bash', 1],
    ])
  })
})

describe('buildToolUsageRows', () => {
  it('merges declared definitions with usage and marks undeclared calls', () => {
    const rows = buildToolUsageRows(
      [
        { name: 'read', description: 'Read a file', parameters: { type: 'object' } },
        { name: 'write', description: 'Write a file', parameters: { type: 'object' } },
      ],
      new Map([
        ['read', 2],
        ['grep', 1],
      ]),
    )

    expect(rows.map((row) => [row.name, row.calls, row.declared])).toEqual([
      ['read', 2, true],
      ['grep', 1, false],
      ['write', 0, true],
    ])
    expect(rows[0].description).toBe('Read a file')
    expect(rows[0].parameters).toEqual({ type: 'object' })
    expect(rows[1].description).toBe('')
  })

  it('handles sessions without a recorded tool set', () => {
    const rows = buildToolUsageRows([], new Map([['bash', 3]]))
    expect(rows).toEqual([
      { name: 'bash', calls: 3, description: '', declared: false, parameters: undefined },
    ])
  })
})

describe('filterToolUsageRows', () => {
  it('matches tool names and descriptions case-insensitively', () => {
    const rows = buildToolUsageRows(
      [
        { name: 'read', description: 'Read a file from disk' },
        { name: 'bash', description: 'Run a shell command' },
      ],
      new Map(),
    )

    expect(filterToolUsageRows(rows, '  FILE ').map((row) => row.name)).toEqual(['read'])
    expect(filterToolUsageRows(rows, 'BASH').map((row) => row.name)).toEqual(['bash'])
    expect(filterToolUsageRows(rows, '')).toBe(rows)
  })
})
