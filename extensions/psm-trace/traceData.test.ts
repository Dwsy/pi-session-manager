import { describe, expect, it } from 'vitest'
import type { PsmCapabilityClient } from '@pi-session-manager/plugin-sdk'

import { loadInspectData } from './inspectData'
import { loadTraceAnalytics } from './traceData'

const jsonl = [
  JSON.stringify({ type: 'session', id: 's1', timestamp: '2026-05-24T00:00:00Z' }),
  JSON.stringify({ type: 'message', id: 'u1', timestamp: '2026-05-24T00:00:01Z', message: { role: 'user', content: 'hello' } }),
  JSON.stringify({
    type: 'message',
    id: 'a1',
    timestamp: '2026-05-24T00:00:02Z',
    message: {
      role: 'assistant',
      provider: 'openai',
      model: 'gpt-test',
      usage: { input: 10, output: 5, totalTokens: 15 },
      content: [{ type: 'toolCall', id: 'tc1', name: 'read', arguments: { path: '/tmp/a.ts' } }],
    },
  }),
  JSON.stringify({ type: 'message', id: 'r1', timestamp: '2026-05-24T00:00:03Z', message: { role: 'toolResult', toolCallId: 'tc1', toolName: 'read', content: 'ok' } }),
  JSON.stringify({ type: 'compaction', id: 'c1', timestamp: '2026-05-24T00:00:04Z', summary: 'compact' }),
].join('\n')

function clientFor(content: string): PsmCapabilityClient {
  return {
    sessions: {
      readFileChunk: async () => ({
        content,
        next_offset: content.length,
        file_size: content.length,
        has_more: false,
      }),
    },
  } as unknown as PsmCapabilityClient
}

describe('psm-trace data extraction', () => {
  it('computes trace analytics from session chunks', async () => {
    const analytics = await loadTraceAnalytics(clientFor(jsonl), {
      id: 's1',
      path: '/tmp/session.jsonl',
      cwd: '/tmp',
      created: '2026-05-24T00:00:00Z',
      modified: '2026-05-24T00:00:04Z',
    })

    expect(analytics.total_user_messages).toBe(1)
    expect(analytics.total_assistant_messages).toBe(1)
    expect(analytics.total_tool_calls).toBe(1)
    expect(analytics.total_tool_results).toBe(1)
    expect(analytics.total_tokens.total).toBe(15)
    expect(analytics.files_read).toEqual(['/tmp/a.ts'])
    expect(analytics.compaction_count).toBe(1)
    expect(analytics.events.find((event) => event.id === 'a1')?.tool_calls[0]?.status).toBe('completed')
  })

  it('extracts inspect data from session chunks', async () => {
    const inspect = await loadInspectData(clientFor(jsonl), '/tmp/session.jsonl')

    expect(inspect.total_raw_entries).toBe(5)
    expect(inspect.compaction_entries).toHaveLength(1)
    expect(inspect.tool_results.tc1.tool_name).toBe('read')
  })
})
