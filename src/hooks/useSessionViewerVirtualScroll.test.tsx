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

  it('uses stable entry IDs as item keys and disables rAF-delayed ResizeObserver', () => {
    const entries = [
      { type: 'message', id: 'entry-a', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } },
      { type: 'message', id: 'entry-b', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] } },
    ] as SessionEntry[]

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
    }))

    expect(result.current.rowVirtualizer.options.getItemKey(0)).toBe('entry-a')
    expect(result.current.rowVirtualizer.options.getItemKey(1)).toBe('entry-b')
    expect(result.current.rowVirtualizer.options.useAnimationFrameWithResizeObserver).toBe(false)
  })

  it('disables the flat virtualizer when enabled=false', () => {
    const entries = [
      { type: 'message', id: 'entry-a', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } },
    ] as SessionEntry[]

    const { result } = renderHook(() => useSessionViewerVirtualScroll({
      renderableEntries: entries,
      loading: false,
      error: null,
      scrollTargetId: null,
      setScrollTargetId: vi.fn(),
      setHasNewMessages: vi.fn(),
      pendingScrollToBottomRef: { current: false },
      expandedToolIds: new Set(),
      enabled: false,
      sessionPath: '/tmp/session.jsonl',
    }))

    expect(result.current.rowVirtualizer.options.count).toBe(0)
    expect(result.current.rowVirtualizer.options.getScrollElement()).toBeNull()
  })
})
