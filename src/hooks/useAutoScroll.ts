import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { RefObject } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'

const BOTTOM_THRESHOLD_PX = 20
const RESIZE_DEBOUNCE_MS = 80
const SKIP_SMOOTH_AFTER_INSTANT_MS = 500

interface UseAutoScrollOptions {
  containerRef: RefObject<HTMLDivElement>
  bottomSentinelRef: RefObject<HTMLDivElement>
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>
  renderableEntriesLength: number
  renderableDigest: string
  loading: boolean
  showLoading: boolean
  error: string | null
}

interface UseAutoScrollResult {
  isAtBottom: boolean
  hasNewMessages: boolean
  newMessageCount: number
  scrollReady: boolean
  scrollToTop: () => void
  scrollToBottom: (smooth?: boolean) => void
  forceFollowToBottom: () => void
  clearUnreadState: () => void
  markUnreadMessage: () => void
  autoFollowRef: React.MutableRefObject<boolean>
  isAtBottomRef: React.MutableRefObject<boolean>
  pendingScrollToBottomRef: React.MutableRefObject<boolean>
}

export function useAutoScroll({
  containerRef,
  bottomSentinelRef,
  rowVirtualizer,
  renderableEntriesLength,
  renderableDigest,
  loading,
  showLoading,
  error,
}: UseAutoScrollOptions): UseAutoScrollResult {
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [newMessageCount, setNewMessageCount] = useState(0)
  const [scrollReady, setScrollReady] = useState(false)

  const isAtBottomRef = useRef(true)
  const autoFollowRef = useRef(true)
  const pendingScrollToBottomRef = useRef(false)
  const prevDigestRef = useRef('')
  const skipSmoothUntilRef = useRef(0)

  const clearUnreadState = useCallback(() => {
    setHasNewMessages(false)
    setNewMessageCount(0)
  }, [])

  const markUnreadMessage = useCallback(() => {
    setHasNewMessages(true)
    setNewMessageCount((prev) => Math.min(prev + 1, 99))
  }, [])

  const forceFollowToBottom = useCallback(() => {
    autoFollowRef.current = true
    isAtBottomRef.current = true
    setIsAtBottom(true)
    pendingScrollToBottomRef.current = true
  }, [])

  const scrollToTop = useCallback(() => {
    if (!containerRef.current || renderableEntriesLength === 0) return
    rowVirtualizer.scrollToIndex(0, { align: 'start' })
  }, [renderableEntriesLength, rowVirtualizer, containerRef])

  const scrollToBottom = useCallback(
    (smooth = false) => {
      const container = containerRef.current
      if (!container) return
      autoFollowRef.current = true
      const lastIndex = Math.max(0, renderableEntriesLength - 1)
      if (renderableEntriesLength > 0) {
        rowVirtualizer.scrollToIndex(lastIndex, { align: 'end' })
      }
      if (smooth) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
        return
      }
      container.scrollTop = container.scrollHeight - container.clientHeight
      skipSmoothUntilRef.current = Date.now() + SKIP_SMOOTH_AFTER_INSTANT_MS
    },
    [renderableEntriesLength, rowVirtualizer, containerRef]
  )

  // --- Scroll event: stick-to-bottom detection ---
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight
      const atBottom = dist <= BOTTOM_THRESHOLD_PX
      isAtBottomRef.current = atBottom
      setIsAtBottom(atBottom)
      if (atBottom) {
        autoFollowRef.current = true
        clearUnreadState()
      }
    }

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        autoFollowRef.current = false
        pendingScrollToBottomRef.current = false
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    container.addEventListener('wheel', handleWheel, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      container.removeEventListener('wheel', handleWheel)
    }
  }, [containerRef, clearUnreadState])

  // --- ResizeObserver: auto-scroll when content grows during streaming ---
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (typeof ResizeObserver === 'undefined') return

    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const observer = new ResizeObserver(() => {
      if (!autoFollowRef.current) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!autoFollowRef.current) return
        const el = containerRef.current
        if (!el) return
        if (Date.now() < skipSmoothUntilRef.current) {
          el.scrollTop = el.scrollHeight - el.clientHeight
        } else {
          bottomSentinelRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
      }, RESIZE_DEBOUNCE_MS)
    })

    const content = container.firstElementChild
    if (content) observer.observe(content)

    return () => {
      observer.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [containerRef, bottomSentinelRef])

  // --- Initial scroll + digest-driven scroll ---
  const revealRafRef = useRef(0)

  useEffect(() => {
    if (loading || showLoading) {
      if (revealRafRef.current) cancelAnimationFrame(revealRafRef.current)
      setScrollReady(false)
      return
    }
    if (error) return

    const changed = renderableDigest !== prevDigestRef.current
    if (changed && autoFollowRef.current) {
      pendingScrollToBottomRef.current = true
    }
    prevDigestRef.current = renderableDigest

    if (pendingScrollToBottomRef.current) {
      scrollToBottom()
      pendingScrollToBottomRef.current = false
      if (revealRafRef.current) cancelAnimationFrame(revealRafRef.current)
      revealRafRef.current = requestAnimationFrame(() => {
        revealRafRef.current = requestAnimationFrame(() => {
          const el = containerRef.current
          if (el) el.scrollTop = el.scrollHeight - el.clientHeight
          setScrollReady(true)
        })
      })
      return
    }

    setScrollReady(true)
  }, [renderableDigest, scrollToBottom, loading, showLoading, error, containerRef])

  useEffect(() => {
    return () => {
      if (revealRafRef.current) cancelAnimationFrame(revealRafRef.current)
    }
  }, [])

  return useMemo(
    () => ({
      isAtBottom,
      hasNewMessages,
      newMessageCount,
      scrollReady,
      scrollToTop,
      scrollToBottom,
      forceFollowToBottom,
      clearUnreadState,
      markUnreadMessage,
      autoFollowRef,
      isAtBottomRef,
      pendingScrollToBottomRef,
    }),
    [isAtBottom, hasNewMessages, newMessageCount, scrollReady, scrollToTop, scrollToBottom, forceFollowToBottom, clearUnreadState, markUnreadMessage]
  )
}
