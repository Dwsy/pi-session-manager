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

export const SESSION_MESSAGE_ITEM_GAP = 16
export const SESSION_PREVIEW_ITEM_GAP = 8
const BOTTOM_THRESHOLD_PX = 8
const HIGHLIGHT_DURATION_MS = 2000
const HIGHLIGHT_RETRY_DELAY_MS = 50
const ROW_OVERSCAN = 8

function estimateSessionEntrySize(
  entry: SessionEntry | undefined,
  cachedHeight: number | undefined,
  previewMode: boolean,
): number {
  if (!entry) return 140 + SESSION_MESSAGE_ITEM_GAP

  // In preview mode, skip stale cache — content is stripped so cached heights
  // from normal mode (including tool calls/thinking) are wildly inaccurate.
  if (!previewMode && cachedHeight) return cachedHeight

  let height: number
  switch (entry.type) {
    case 'message': {
      const content = entry.message?.content ?? []
      const role = entry.message?.role
      if (previewMode) {
        // In previewMode, tool calls are stripped from rendering —
        // only count text content to match actual rendered height.
        const textItems = content.filter((item) => item.type === 'text')
        const textLength = textItems.reduce((sum, item) => sum + (item.text?.length ?? 0), 0)
        const baseHeight = role === 'user' ? 48 : 40
        const contentHeight = Math.ceil(textLength / 90) * 24
        height = Math.min(baseHeight + contentHeight, 800)
      } else {
        // Normal mode: account for tool calls, thinking blocks, text
        const textLength = content.reduce((sum, item) => {
          if (item.type === 'text') return sum + (item.text?.length ?? 0)
          if (item.type === 'toolCall') return sum + 80 // tool call name + params preview
          if (item.type === 'thinking') return sum + (item.thinking?.length ?? 0) * 0.3
          return sum
        }, 0)
        const hasTools = content.some((item) => item.type === 'toolCall')
        const baseHeight = hasTools ? 140 : 100
        const contentHeight = Math.ceil(textLength / 80) * 32
        height = Math.min(baseHeight + contentHeight, 800)
      }
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
  return height + (previewMode ? SESSION_PREVIEW_ITEM_GAP : SESSION_MESSAGE_ITEM_GAP)
}

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
  /** External renderer handles scrollTargetId, e.g. conversation groups. */
  handlesScrollTarget?: boolean
}

export interface UseSessionViewerVirtualScrollResult {
  messagesContainerRef: RefObject<HTMLDivElement>
  messagesWrapperRef: RefObject<HTMLDivElement>
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>
  isAtBottom: boolean
  isAtBottomRef: MutableRefObject<boolean>
  isAtTop: boolean
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
  handlesScrollTarget = false,
}: UseSessionViewerVirtualScrollOptions): UseSessionViewerVirtualScrollResult {
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [isAtTop, setIsAtTop] = useState(true)

  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesWrapperRef = useRef<HTMLDivElement>(null)
  const internalIsAtBottomRef = useRef(true)
  const isAtBottomRef = externalIsAtBottomRef ?? internalIsAtBottomRef
  const isAtTopRef = useRef(true)
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
      const cachedHeight = entry
        ? measuredHeightsRef.current.get(entry.id)
        : undefined
      return estimateSessionEntrySize(entry, cachedHeight, previewMode)
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

  // Reset on session change: clear cache, force re-measure, scroll to top
  useEffect(() => {
    measuredHeightsRef.current.clear()
    hasTriggeredReachBottomRef.current = false
    rowVirtualizer.measure()
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0
    }
    setIsAtBottom(true)
    isAtBottomRef.current = true
    setIsAtTop(true)
    isAtTopRef.current = true
  }, [sessionPath, rowVirtualizer])

  // Preview mode change: clear cache and let virtualizer re-estimate.
  // Do NOT call measure() here — React hasn't re-rendered with stripped content yet,
  // so measuring would cache stale heights from the old DOM.
  useEffect(() => {
    measuredHeightsRef.current.clear()
    hasTriggeredReachBottomRef.current = false
  }, [previewMode])

  // When tools expand/collapse individually, re-measure with debounce to let DOM settle
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    // Save current scroll position relative to visible content
    const scrollTop = container.scrollTop
    const scrollRatio = container.scrollHeight > 0 ? scrollTop / container.scrollHeight : 0

    const timeoutId = requestAnimationFrame(() => {
      rowVirtualizer.measure()

      // Restore scroll ratio after measurement to prevent jumping
      requestAnimationFrame(() => {
        if (container.scrollHeight > 0) {
          const newScrollTop = container.scrollHeight * scrollRatio
          container.scrollTop = newScrollTop
        }
      })
    })
    return () => {
      cancelAnimationFrame(timeoutId)
    }
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

  const scrollTargetRafRef = useRef<number | null>(null)
  const scrollTargetTimeoutsRef = useRef<number[]>([])

  useEffect(() => {
    if (handlesScrollTarget) return
    if (!scrollTargetId || !messagesContainerRef.current) return
    // If entry not yet in the virtualizer (data still loading), skip —
    // this effect will re-run when renderableEntries changes and
    // scrollToEntryId updates, so the target is NOT consumed yet.
    if (!scrollToEntryId(scrollTargetId, 'center')) return

    const tryHighlight = () => {
      const element = document.getElementById(`entry-${scrollTargetId}`)
      if (!element) return false

      element.classList.add('highlight')
      const timeoutId = window.setTimeout(() => {
        element.classList.remove('highlight')
      }, HIGHLIGHT_DURATION_MS)
      scrollTargetTimeoutsRef.current.push(timeoutId)
      return true
    }

    scrollTargetRafRef.current = requestAnimationFrame(() => {
      if (!tryHighlight()) {
        const retryId = window.setTimeout(() => {
          tryHighlight()
        }, HIGHLIGHT_RETRY_DELAY_MS)
        scrollTargetTimeoutsRef.current.push(retryId)
      }
    })

    setScrollTargetId(null)

    return () => {
      if (scrollTargetRafRef.current !== null) {
        cancelAnimationFrame(scrollTargetRafRef.current)
      }
      for (const tid of scrollTargetTimeoutsRef.current) {
        window.clearTimeout(tid)
      }
      scrollTargetTimeoutsRef.current = []
    }
  }, [handlesScrollTarget, scrollTargetId, scrollToEntryId, setScrollTargetId])

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

        const atTop = container.scrollTop <= BOTTOM_THRESHOLD_PX
        const wasAtTop = isAtTopRef.current

        if (wasAtTop !== atTop) {
          isAtTopRef.current = atTop
          setIsAtTop(atTop)
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
    isAtTop,
    scrollToTop,
    scrollToBottom,
    scrollToEntryId,
  }
}
