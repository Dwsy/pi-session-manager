// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { SessionEntry } from '@/types'
import { useSessionViewerInMessageSearch } from './useSessionViewerInMessageSearch'

function rawMessage(id: string, role: string, content: unknown): SessionEntry {
  return {
    type: 'message',
    id,
    timestamp: '2026-10-08T00:00:00.000Z',
    message: { role, content },
  } as unknown as SessionEntry
}

describe('useSessionViewerInMessageSearch', () => {
  it('searches string user and assistant messages without calling .filter on strings', async () => {
    const entries = [
      rawMessage('user-1', 'user', 'needle from user'),
      rawMessage('assistant-1', 'assistant', 'needle from assistant'),
      rawMessage('assistant-empty', 'assistant', ''),
    ]

    const { result } = renderHook(() => useSessionViewerInMessageSearch({
      renderableEntries: entries,
      toolResultByCallId: new Map(),
      showThinking: false,
      sessionPath: '/tmp/pi.jsonl',
    }))

    act(() => result.current.setSearchQuery('needle'))

    await waitFor(() => expect(result.current.totalMatches).toBe(2))
    expect(result.current.currentTarget?.rowEntryId).toBe('user-1')
  })
})
