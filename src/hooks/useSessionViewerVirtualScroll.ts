import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from 'react'
import { measureElement, useVirtualizer } from '@tanstack/react-virtual'
import type { Virtualizer } from '@tanstack/react-virtual'

import type { SessionEntry } from '../types'

const MESSAGE_ITEM_GAP = 16
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
  toolsExpanded: boolean
  sessionPath: string
  isAtBottomRef?: MutableRefObject<boolean>
  onReachBottom?: () => void
}

export interface UseSessionViewerVirtualScrollResult {
  messagesContainerRef: RefObject<HTMLDivElement>
  messagesWrapperRef: RefObject<HTMLDivElement>
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>
  isAtBottom: boolean
  isAtBottomRef: MutableRefObject<boolean>
  scrollToTop: () => void
  scrollToBottom: (smooth?: boolean) => void
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
  toolsExpanded,
  sessionPath,
  isAtBottomRef: externalIsAtBottomRef,
  onReachBottom,
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
          const textLength = content
            .filter((item) => item.type === 'text')
            .reduce((sum, item) => sum + (item.text?.length ?? 0), 0)
          const baseHeight = 100
          const contentHeight = Math.ceil(textLength / 80) * 32
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
      return height + MESSAGE_ITEM_GAP
    },
    [renderableEntries],
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

  useEffect(() => {
    measuredHeightsRef.current.clear()
    hasTriggeredReachBottomRef.current = false
  }, [expandedToolIds, sessionPath, toolsExpanded])

  useEffect(() => {
    if (loading || error || renderableEntries.length === 0) return
    if (!pendingScrollToBottomRef.current) return

    const rafId = requestAnimationFrame(() => {
      const lastIndex = renderableEntries.length - 1
      rowVirtualizer.scrollToIndex(lastIndex, { align: 'end' })
      pendingScrollToBottomRef.current = false
    })

    return () => cancelAnimationFrame(rafId)
  }, [
    loading,
    error,
    renderableEntries.length,
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

  useEffect(() => {
    if (!scrollTargetId || !messagesContainerRef.current) return

    const targetIndex = entryIndexById.get(scrollTargetId)
    if (targetIndex === undefined) return

    rowVirtualizer.scrollToIndex(targetIndex, { align: 'center' })

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
  }, [scrollTargetId, entryIndexById, rowVirtualizer, setScrollTargetId])

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
        const canScroll = container.scrollHeight > container.clientHeight + BOTTOM_THRESHOLD_PX
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
  }
}
