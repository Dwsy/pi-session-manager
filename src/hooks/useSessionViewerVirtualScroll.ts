import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from 'react'
import { measureElement, useVirtualizer } from '@tanstack/react-virtual'
import type { Virtualizer } from '@tanstack/react-virtual'

import type { SessionEntry } from '@/types'

type ScrollAlignment = 'auto' | 'center' | 'end' | 'start'

const MESSAGE_ITEM_GAP = 16
const PREVIEW_ITEM_GAP = 8
const BOTTOM_THRESHOLD_PX = 8
const HIGHLIGHT_DURATION_MS = 2000
const HIGHLIGHT_RETRY_DELAY_MS = 50
const ROW_OVERSCAN = 8

export interface UseSessionViewerVirtualScrollOptions {
  renderableEntries: SessionEntry[]
  loading: boolean
  error: string | null
  scrollTargetId: string | null
  setScrollTargetId: Dispatch<SetStateAction<string | null>>
  setHasNewMessages: Dispatch<SetStateAction<boolean>>
  pendingScrollToBottomRef: MutableRefObject<boolean>
  expandedToolIds: Set<string>
  sessionPath: string
  isAtBottomRef?: MutableRefObject<boolean>
  onReachBottom?: () => void
  /** Preview mode: strip tool calls from height estimation */
  previewMode?: boolean
}

export interface UseSessionViewerVirtualScrollResult {
  messagesContainerRef: RefObject<HTMLDivElement>
  messagesWrapperRef: RefObject<HTMLDivElement>
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>
  isAtBottom: boolean
  isAtBottomRef: MutableRefObject<boolean>
  scrollToTop: () => void
  scrollToBottom: (smooth?: boolean) => void
  scrollToEntryId: (entryId: string, align?: ScrollAlignment) => boolean
}

export function useSessionViewerVirtualScroll({
  renderableEntries,
  loading,
  error,
  scrollTargetId,
  setScrollTargetId,
  setHasNewMessages,
  pendingScrollToBottomRef,
  expandedToolIds,
  sessionPath,
  isAtBottomRef: externalIsAtBottomRef,
  onReachBottom,
  previewMode = false,
}: UseSessionViewerVirtualScrollOptions): UseSessionViewerVirtualScrollResult {
  const [isAtBottom, setIsAtBottom] = useState(true)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesWrapperRef = useRef<HTMLDivElement>(null)
  const internalIsAtBottomRef = useRef(true)
  const isAtBottomRef = externalIsAtBottomRef ?? internalIsAtBottomRef
  const measuredHeightsRef = useRef<Map<string, number>>(new Map())
  const hasTriggeredReachBottomRef = useRef(false)

  const entryIndexById = useMemo(() => {
    const indexById = new Map<string, number>()
    for (let index = 0; index < renderableEntries.length; index += 1) {
      const entry = renderableEntries[index]
      if (!entry) continue
      indexById.set(entry.id, index)
    }
    return indexById
  }, [renderableEntries])

  const estimateEntrySize = useCallback(
    (index: number) => {
      const entry = renderableEntries[index]
      if (!entry) return 140 + MESSAGE_ITEM_GAP

      const cachedHeight = measuredHeightsRef.current.get(entry.id)
      if (cachedHeight) return cachedHeight

      let height: number
      switch (entry.type) {
        case 'message': {
          const content = entry.message?.content ?? []
          // In previewMode, only count text content for height estimation
          const textItems = content.filter((item) => item.type === 'text')
          const textLength = textItems.reduce((sum, item) => sum + (item.text?.length ?? 0), 0)
          const role = entry.message?.role
          const baseHeight = previewMode ? (role === 'user' ? 48 : 40) : 100
          const contentHeight = previewMode ? Math.ceil(textLength / 90) * 24 : Math.ceil(textLength / 80) * 32
          height = Math.min(baseHeight + contentHeight, 800)
          break
        }
        case 'model_change':
          height = 64
          break
        case 'compaction':
          height = 180
          break
        case 'branch_summary':
          height = 160
          break
        case 'custom_message':
          height = 120
          break
        default:
          height = 120
          break
      }
      return height + (previewMode ? PREVIEW_ITEM_GAP : MESSAGE_ITEM_GAP)
    },
    [renderableEntries, previewMode],
  )

  const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: renderableEntries.length,
    getScrollElement: () => messagesContainerRef.current,
    estimateSize: estimateEntrySize,
    overscan: ROW_OVERSCAN,
    lanes: 1,
    isScrollingResetDelay: 200,
    useAnimationFrameWithResizeObserver: true,
    measureElement: (element, entry, instance) => {
      const height = measureElement(element, entry, instance)
      const entryId = element.getAttribute('data-entry-id')
      if (entryId) {
        measuredHeightsRef.current.set(entryId, height)
      }
      return height
    },
  })

  // Only reset scroll when session changes, not when individual tools expand/collapse
  useEffect(() => {
    measuredHeightsRef.current.clear()
    hasTriggeredReachBottomRef.current = false
    // Force virtualizer to recalculate all sizes
    rowVirtualizer.measure()
    // Reset scroll position to top when session changes
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0
    }
    setIsAtBottom(true)
    isAtBottomRef.current = true
  }, [sessionPath, previewMode, rowVirtualizer])

  // When tools expand/collapse individually, re-measure without resetting scroll
  useEffect(() => {
    measuredHeightsRef.current.clear()
    rowVirtualizer.measure()
  }, [expandedToolIds, rowVirtualizer])

  useEffect(() => {
    if (loading || error || renderableEntries.length === 0) return
    if (!pendingScrollToBottomRef.current) return

    const rafId = requestAnimationFrame(() => {
      const lastIndex = renderableEntries.length - 1
      // If we are already very close to the bottom, we can just jump to keep it "sticky"
      // Performance: 'auto' is faster, but we can try to make it feel smooth by proper timing.
      rowVirtualizer.scrollToIndex(lastIndex, {
        align: 'end',
        behavior: 'auto' // 'smooth' can be too slow for fast streaming, 'auto' is more responsive.
      })
      pendingScrollToBottomRef.current = false
    })

    return () => cancelAnimationFrame(rafId)
  }, [
    loading,
    error,
    renderableEntries, // Watch for content updates too (typewriter effect)
    rowVirtualizer,
    pendingScrollToBottomRef,
  ])

  const scrollToTop = useCallback(() => {
    if (!messagesContainerRef.current) return
    if (renderableEntries.length === 0) return
    rowVirtualizer.scrollToIndex(0, { align: 'start' })
  }, [renderableEntries.length, rowVirtualizer])

  const scrollToBottom = useCallback(
    (_smooth = false) => {
      if (renderableEntries.length === 0) return
      const lastIndex = renderableEntries.length - 1
      rowVirtualizer.scrollToIndex(lastIndex, { align: 'end' })
    },
    [renderableEntries.length, rowVirtualizer],
  )

  const scrollToEntryId = useCallback(
    (entryId: string, align: ScrollAlignment = 'center') => {
      const targetIndex = entryIndexById.get(entryId)
      if (targetIndex === undefined) {
        return false
      }

      rowVirtualizer.scrollToIndex(targetIndex, { align })
      return true
    },
    [entryIndexById, rowVirtualizer],
  )

  useEffect(() => {
    if (!scrollTargetId || !messagesContainerRef.current) return
    if (!scrollToEntryId(scrollTargetId, 'center')) return

    const highlightTimeoutIds: number[] = []
    const tryHighlight = () => {
      const element = document.getElementById(`entry-${scrollTargetId}`)
      if (!element) return false

      element.classList.add('highlight')
      const timeoutId = window.setTimeout(() => {
        element.classList.remove('highlight')
      }, HIGHLIGHT_DURATION_MS)
      highlightTimeoutIds.push(timeoutId)
      return true
    }

    const rafId = requestAnimationFrame(() => {
      if (!tryHighlight()) {
        const retryId = window.setTimeout(() => {
          tryHighlight()
        }, HIGHLIGHT_RETRY_DELAY_MS)
        highlightTimeoutIds.push(retryId)
      }
    })

    setScrollTargetId(null)

    return () => {
      cancelAnimationFrame(rafId)
      for (const timeoutId of highlightTimeoutIds) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [scrollTargetId, scrollToEntryId, setScrollTargetId])

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    let rafId: number | null = null
    const handleScroll = () => {
      if (rafId !== null) return

      rafId = requestAnimationFrame(() => {
        rafId = null

        const distanceToBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight
        const atBottom = distanceToBottom <= BOTTOM_THRESHOLD_PX
        const canScroll =
          container.scrollHeight > container.clientHeight + BOTTOM_THRESHOLD_PX
        const wasAtBottom = isAtBottomRef.current

        if (wasAtBottom !== atBottom) {
          isAtBottomRef.current = atBottom
          setIsAtBottom(atBottom)
        }

        if (atBottom) {
          if (!wasAtBottom) {
            setHasNewMessages(false)
          }
          if (canScroll && !hasTriggeredReachBottomRef.current) {
            hasTriggeredReachBottomRef.current = true
            onReachBottom?.()
          }
          return
        }

        hasTriggeredReachBottomRef.current = false
      })
    }

    handleScroll()
    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [loading, error, onReachBottom, renderableEntries.length, setHasNewMessages])

  return {
    messagesContainerRef,
    messagesWrapperRef,
    rowVirtualizer,
    isAtBottom,
    isAtBottomRef,
    scrollToTop,
    scrollToBottom,
    scrollToEntryId,
  }
}
