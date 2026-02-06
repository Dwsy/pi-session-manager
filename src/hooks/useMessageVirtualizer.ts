import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'

import type { SessionEntry } from '../types'

const INITIAL_WINDOW = 20
const PAGE_SIZE = 30

interface UseMessageVirtualizerOptions {
  entries: SessionEntry[]
  containerRef: RefObject<HTMLDivElement>
}

interface UseMessageVirtualizerResult {
  renderableEntries: SessionEntry[]
  renderableDigest: string
  entryIndexById: Map<string, number>
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>
  resetMeasurements: () => void
  loadMore: () => void
  hasMore: boolean
}

export function useMessageVirtualizer({
  entries,
  containerRef,
}: UseMessageVirtualizerOptions): UseMessageVirtualizerResult {
  const measuredHeightsRef = useRef<Map<number, number>>(new Map())
  const [windowStart, setWindowStart] = useState(-1)
  const loadMoreAnchorRef = useRef<{ prevLen: number } | null>(null)
  const prevEntryCountRef = useRef(0)

  const allRenderable = useMemo(() => {
    return entries.filter(entry => {
      if (entry.type === 'message') {
        const role = entry.message?.role
        return role === 'user' || role === 'assistant'
      }
      return (
        entry.type === 'model_change' ||
        entry.type === 'compaction' ||
        entry.type === 'branch_summary' ||
        entry.type === 'custom_message'
      )
    })
  }, [entries])

  useEffect(() => {
    const prev = prevEntryCountRef.current
    prevEntryCountRef.current = allRenderable.length
    if (allRenderable.length === 0 || (prev > 0 && allRenderable.length < prev * 0.5)) {
      setWindowStart(-1)
    }
  }, [allRenderable.length])

  const renderableEntries = useMemo(() => {
    if (allRenderable.length <= INITIAL_WINDOW) return allRenderable
    if (windowStart === -1) return allRenderable.slice(-INITIAL_WINDOW)
    return allRenderable.slice(windowStart)
  }, [allRenderable, windowStart])

  const hasMore = useMemo(() => {
    if (allRenderable.length <= INITIAL_WINDOW) return false
    const effectiveStart = windowStart === -1
      ? allRenderable.length - INITIAL_WINDOW
      : windowStart
    return effectiveStart > 0
  }, [allRenderable.length, windowStart])

  const loadMore = useCallback(() => {
    const currentStart = windowStart === -1
      ? Math.max(0, allRenderable.length - INITIAL_WINDOW)
      : windowStart
    if (currentStart <= 0) return
    loadMoreAnchorRef.current = { prevLen: renderableEntries.length }
    const newStart = Math.max(0, currentStart - PAGE_SIZE)
    setWindowStart(newStart)
  }, [windowStart, allRenderable.length, renderableEntries.length])

  const entryIndexById = useMemo(() => {
    const map = new Map<string, number>()
    renderableEntries.forEach((entry, index) => {
      map.set(entry.id, index)
    })
    return map
  }, [renderableEntries])

  const renderableDigest = useMemo(() => {
    const len = renderableEntries.length
    if (len === 0) return '0'
    const tailCount = Math.min(3, len)
    const parts: string[] = [String(len)]
    for (let i = len - tailCount; i < len; i++) {
      const entry = renderableEntries[i]
      if (entry.type === 'message' && entry.message) {
        const contentLen = entry.message.content.reduce(
          (sum, c) => sum + (c.text?.length || 0) + (c.thinking?.length || 0),
          0
        )
        parts.push(`${entry.id}:${entry.message.role}:${contentLen}`)
      } else {
        parts.push(entry.id)
      }
    }
    if (hasMore) parts.push(`s${windowStart}`)
    return parts.join('|')
  }, [renderableEntries, hasMore, windowStart])

  const estimateEntrySize = useCallback((index: number) => {
    const cachedHeight = measuredHeightsRef.current.get(index)
    if (cachedHeight) return cachedHeight

    const entry = renderableEntries[index]
    if (!entry) return 140

    switch (entry.type) {
      case 'message': {
        const content = entry.message?.content || []
        const textLength = content
          .filter(c => c.type === 'text')
          .reduce((sum, c) => sum + (c.text?.length || 0), 0)
        const baseHeight = 100
        const contentHeight = Math.ceil(textLength / 100) * 40
        return Math.min(baseHeight + contentHeight, 800)
      }
      case 'model_change':
        return 64
      case 'compaction':
        return 180
      case 'branch_summary':
        return 160
      case 'custom_message':
        return 120
      default:
        return 120
    }
  }, [renderableEntries])

  useLayoutEffect(() => {
    if (!loadMoreAnchorRef.current) return
    const { prevLen } = loadMoreAnchorRef.current
    loadMoreAnchorRef.current = null
    const addedCount = renderableEntries.length - prevLen
    if (addedCount <= 0) return

    const shifted = new Map<number, number>()
    for (const [key, value] of measuredHeightsRef.current) {
      shifted.set(key + addedCount, value)
    }
    measuredHeightsRef.current = shifted

    const container = containerRef.current
    if (!container) return
    let heightAdded = 0
    for (let i = 0; i < addedCount; i++) {
      heightAdded += estimateEntrySize(i)
    }
    container.scrollTop += heightAdded
  }, [renderableEntries.length, containerRef, estimateEntrySize])

  const rowVirtualizer = useVirtualizer({
    count: renderableEntries.length,
    getScrollElement: () => containerRef.current,
    estimateSize: estimateEntrySize,
    overscan: 3,
    measureElement: (el) => {
      const index = Number(el.getAttribute('data-index'))
      const height = el.getBoundingClientRect().height
      measuredHeightsRef.current.set(index, height)
      return height
    },
  })

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      rowVirtualizer.measure()
    })
    return () => cancelAnimationFrame(raf)
  }, [renderableEntries.length, renderableDigest, rowVirtualizer])

  const resetMeasurements = useCallback(() => {
    measuredHeightsRef.current.clear()
    setWindowStart(-1)
  }, [])

  return useMemo(
    () => ({
      renderableEntries,
      renderableDigest,
      entryIndexById,
      rowVirtualizer,
      resetMeasurements,
      loadMore,
      hasMore,
    }),
    [renderableEntries, renderableDigest, entryIndexById, rowVirtualizer, resetMeasurements, loadMore, hasMore]
  )
}
