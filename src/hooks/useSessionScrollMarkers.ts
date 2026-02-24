import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent, RefObject } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { SessionEntry } from '../types'

export interface ScrollMarker {
  entry: SessionEntry
  top: number
  preview: string
}

interface UseSessionScrollMarkersOptions {
  entries: SessionEntry[]
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>
  estimateEntrySize: (index: number) => number
  messagesContainerRef: RefObject<HTMLDivElement>
  messagesWrapperRef: RefObject<HTMLDivElement>
  isMobile: boolean
  onSelectEntry: (entryId: string) => void
  previewFallback: string
  layoutDeps?: unknown[]
}

interface UseSessionScrollMarkersResult {
  markers: ScrollMarker[]
  showMarkers: boolean
  toggleMarkers: () => void
  activeMarkerId: string | null
  markersPanelRef: RefObject<HTMLDivElement>
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerLeave: (event: PointerEvent) => void
}

export function useSessionScrollMarkers({
  entries,
  rowVirtualizer,
  estimateEntrySize,
  messagesContainerRef,
  messagesWrapperRef,
  isMobile,
  onSelectEntry,
  previewFallback,
  layoutDeps = [],
}: UseSessionScrollMarkersOptions): UseSessionScrollMarkersResult {
  const [showMarkers, setShowMarkers] = useState(false)
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null)
  const [messagesOffsetTop, setMessagesOffsetTop] = useState(0)
  const [scrollMetrics, setScrollMetrics] = useState({ scrollHeight: 0, clientHeight: 0 })

  const markersPanelRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeMarkerRef = useRef<string | null>(null)
  const isScrubbingRef = useRef(false)

  const userEntryPositions = useMemo(() => {
    return entries
      .map((entry, index) => {
        if (entry.type === 'message' && entry.message?.role === 'user') {
          return { entry, index }
        }
        return null
      })
      .filter((item): item is { entry: SessionEntry; index: number } => Boolean(item))
  }, [entries])

  const getMessagePreview = useCallback((entry: SessionEntry) => {
    const content = entry.message?.content || []
    const text = content
      .filter(item => item.type === 'text' && item.text)
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!text) return previewFallback
    return text.length > 80 ? `${text.slice(0, 80)}…` : text
  }, [previewFallback])

  const updateMetrics = useCallback(() => {
    if (messagesWrapperRef.current) {
      setMessagesOffsetTop(messagesWrapperRef.current.offsetTop)
    }
    if (messagesContainerRef.current) {
      const { scrollHeight, clientHeight } = messagesContainerRef.current
      setScrollMetrics(prev =>
        prev.scrollHeight === scrollHeight && prev.clientHeight === clientHeight
          ? prev
          : { scrollHeight, clientHeight }
      )
    }
  }, [messagesContainerRef, messagesWrapperRef])

  useEffect(() => {
    updateMetrics()
    const container = messagesContainerRef.current
    const wrapper = messagesWrapperRef.current
    const observer = new ResizeObserver(updateMetrics)
    if (container) observer.observe(container)
    if (wrapper) observer.observe(wrapper)
    const handleScroll = () => updateMetrics()
    container?.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', updateMetrics)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateMetrics)
      container?.removeEventListener('scroll', handleScroll)
    }
  }, [updateMetrics, entries.length, isMobile, ...layoutDeps])

  const totalSize = rowVirtualizer.getTotalSize()

  useEffect(() => {
    const rafId = requestAnimationFrame(updateMetrics)
    return () => cancelAnimationFrame(rafId)
  }, [totalSize, entries.length, updateMetrics])

  const markers = useMemo(() => {
    if (userEntryPositions.length === 0) return []
    if (totalSize <= 0) return []

    const fallbackScrollHeight = messagesOffsetTop + totalSize
    const scrollHeight = scrollMetrics.scrollHeight || fallbackScrollHeight

    return userEntryPositions
      .map(({ entry, index }) => {
        const offsetResult = rowVirtualizer.getOffsetForIndex(index, 'start')
        const estimatedOffset = estimateEntrySize(index) * index
        const entryOffset = offsetResult ? offsetResult[0] : estimatedOffset
        const ratio = scrollHeight > 0
          ? (messagesOffsetTop + entryOffset) / scrollHeight
          : 0
        return {
          entry,
          top: Math.min(Math.max(ratio, 0), 1),
          preview: getMessagePreview(entry),
        }
      })
      .filter((item): item is ScrollMarker => Boolean(item))
  }, [userEntryPositions, rowVirtualizer, messagesOffsetTop, estimateEntrySize, getMessagePreview, scrollMetrics, totalSize])

  const triggerHaptic = useCallback((duration = 8) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(duration)
    }
  }, [])

  const toggleMarkers = useCallback(() => {
    setShowMarkers(prev => {
      const next = !prev
      if (next) triggerHaptic(12)
      return next
    })
  }, [triggerHaptic])

  useEffect(() => {
    if (!showMarkers) {
      activeMarkerRef.current = null
      setActiveMarkerId(null)
      isScrubbingRef.current = false
    }
  }, [showMarkers])

  useEffect(() => () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const getNearestMarker = useCallback((clientY: number) => {
    if (!markersPanelRef.current || markers.length === 0) return null
    const rect = markersPanelRef.current.getBoundingClientRect()
    if (rect.height <= 0) return null
    const ratio = (clientY - rect.top) / rect.height
    let nearest = markers[0]
    let minDistance = Math.abs(nearest.top - ratio)
    for (const marker of markers) {
      const distance = Math.abs(marker.top - ratio)
      if (distance < minDistance) {
        minDistance = distance
        nearest = marker
      }
    }
    return nearest
  }, [markers])

  const activateMarker = useCallback((marker: ScrollMarker | null, shouldScroll: boolean) => {
    if (!marker) return
    if (activeMarkerRef.current !== marker.entry.id) {
      activeMarkerRef.current = marker.entry.id
      setActiveMarkerId(marker.entry.id)
      if (shouldScroll) {
        onSelectEntry(marker.entry.id)
      }
      triggerHaptic(6)
      return
    }
    if (shouldScroll) {
      onSelectEntry(marker.entry.id)
    }
  }, [onSelectEntry, triggerHaptic])

  const handleMarkersPointerDown = useCallback((event: PointerEvent) => {
    if (!isMobile) return
    event.preventDefault()
    const startY = event.clientY
    const marker = getNearestMarker(startY)
    if (marker) {
      setActiveMarkerId(marker.entry.id)
    }

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
    }
    longPressTimerRef.current = setTimeout(() => {
      isScrubbingRef.current = true
      triggerHaptic(10)
      activateMarker(getNearestMarker(startY), true)
    }, 140)
  }, [isMobile, getNearestMarker, activateMarker, triggerHaptic])

  const handleMarkersPointerMove = useCallback((event: PointerEvent) => {
    if (!isMobile || !isScrubbingRef.current) return
    event.preventDefault()
    activateMarker(getNearestMarker(event.clientY), true)
  }, [isMobile, getNearestMarker, activateMarker])

  const handleMarkersPointerUp = useCallback((event: PointerEvent) => {
    if (!isMobile) return
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    if (!isScrubbingRef.current) {
      activateMarker(getNearestMarker(event.clientY), true)
    }
    isScrubbingRef.current = false
    activeMarkerRef.current = null
    setActiveMarkerId(null)
  }, [isMobile, getNearestMarker, activateMarker])

  return {
    markers,
    showMarkers,
    toggleMarkers,
    activeMarkerId,
    markersPanelRef,
    onPointerDown: handleMarkersPointerDown,
    onPointerMove: handleMarkersPointerMove,
    onPointerUp: handleMarkersPointerUp,
    onPointerLeave: handleMarkersPointerUp,
  }
}
