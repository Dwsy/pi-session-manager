// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SessionEntry } from '@/types'
import { useSessionViewerVirtualScroll } from './useSessionViewerVirtualScroll'

describe('useSessionViewerVirtualScroll', () => {
  it.each([false, true])('estimates raw string message content in previewMode=%s', (previewMode) => {
    const entries = [{
      type: 'message',
      id: 'raw-assistant',
      message: { role: 'assistant', content: 'sample text' },
    }] as unknown as SessionEntry[]

    const { result } = renderHook(() => useSessionViewerVirtualScroll({
      renderableEntries: entries,
      loading: false,
      error: null,
      scrollTargetId: null,
      setScrollTargetId: vi.fn(),
      setHasNewMessages: vi.fn(),
      pendingScrollToBottomRef: { current: false },
      expandedToolIds: new Set(),
      sessionPath: '/tmp/session.jsonl',
      previewMode,
    }))

    expect(result.current.rowVirtualizer.options.estimateSize(0)).toBeGreaterThan(0)
  })
})
