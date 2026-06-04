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

  it('passes sourceFilter through to full text search and returns pagination metadata atomically', async () => {
    const plugin = new MessageSearchPlugin()

    const { results, pagination } = await plugin.searchPage('', createContext(), {
      roleFilter: 'all',
      sourceFilter: 'labels_only',
      sortMode: 'newest',
      page: 0,
      pageSize: 20,
    })

    expect(mockFullTextSearchRuntime).toHaveBeenCalledWith(expect.objectContaining({
      query: '',
      sourceFilter: 'labels_only',
    }))
    expect(results).toHaveLength(1)
    expect(pagination).toEqual({
      totalHits: 1,
      hasMore: false,
    })
    expect((results[0].metadata as { matchReason?: string }).matchReason).toBe('label')
  })

  it('records pagination metadata for an empty result page', async () => {
    mockFullTextSearchRuntime.mockResolvedValueOnce({
      hits: [],
      total_hits: 3,
      has_more: false,
    })

    const plugin = new MessageSearchPlugin()

    const { results, pagination } = await plugin.searchPage('', createContext(), {
      roleFilter: 'all',
      sourceFilter: 'labels_only',
      sortMode: 'newest',
      page: 1,
      pageSize: 20,
    })

    expect(results).toEqual([])
    expect(pagination).toEqual({
      totalHits: 3,
      hasMore: false,
    })
  })
})
