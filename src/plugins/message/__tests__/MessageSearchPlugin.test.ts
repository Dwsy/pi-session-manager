// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

import i18n from '../../../i18n'
import { MessageSearchPlugin } from '../MessageSearchPlugin'
import type { SearchContext } from '@/plugins/types'

const { mockFullTextSearchRuntime, mockGetRuntimeSessionByPath } = vi.hoisted(() => ({
  mockFullTextSearchRuntime: vi.fn(),
  mockGetRuntimeSessionByPath: vi.fn(),
}))

vi.mock('@/runtime-data/sessionSource', () => ({
  fullTextSearchRuntime: mockFullTextSearchRuntime,
  getRuntimeSessionByPath: mockGetRuntimeSessionByPath,
}))

function createContext(): SearchContext {
  return {
    sessions: [],
    selectedProject: null,
    selectedSession: null,
    searchCurrentProjectOnly: false,
    setSelectedSession: vi.fn(),
    setSelectedProject: vi.fn(),
    closeCommandMenu: vi.fn(),
    setPendingScrollEntryId: vi.fn(),
    t: i18n.t.bind(i18n),
  }
}

describe('MessageSearchPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRuntimeSessionByPath.mockResolvedValue(null)
    mockFullTextSearchRuntime.mockResolvedValue({
      hits: [
        {
          session_id: 'session-1',
          entry_id: 'entry-1',
          session_path: '/tmp/project/session.jsonl',
          session_name: 'Alpha',
          role: 'user',
          source_type: 'label',
          content: 'Important label',
          timestamp: '2026-04-09T10:00:00Z',
          score: 42,
          match_reason: 'label',
        },
      ],
      total_hits: 1,
      has_more: false,
    })
  })

  it('passes sourceFilter through to full text search and preserves matchReason metadata', async () => {
    const plugin = new MessageSearchPlugin()
    plugin.setFTSOptions({
      roleFilter: 'all',
      sourceFilter: 'labels_only',
      sortMode: 'newest',
      page: 0,
      pageSize: 20,
    })

    const results = await plugin.search('', createContext())

    expect(mockFullTextSearchRuntime).toHaveBeenCalledWith(expect.objectContaining({
      query: '',
      sourceFilter: 'labels_only',
    }))
    expect(results).toHaveLength(1)
    expect((results[0].metadata as { matchReason?: string }).matchReason).toBe('label')
  })
})
