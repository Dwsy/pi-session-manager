import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent, RefObject } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { SessionEntry } from '../types'

export interface ScrollMarker {
  entry: SessionEntry
  top: number
  preview: string
  markerType: 'user' | 'compaction'
}

interface UseSessionScrollMarkersOptions {
  entries: SessionEntry[]
  rowVirtualizer: Virtualizer<HTMLDivElement, HTMLDivElement>
  estimateEntrySize: (index: number) => number
  isMobile: boolean
  onSelectEntry: (entryId: string) => void
  previewFallback: string
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
  isMobile,
  onSelectEntry,
  previewFallback,
}: UseSessionScrollMarkersOptions): UseSessionScrollMarkersResult {
  const [showMarkers, setShowMarkers] = useState(false)
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null)

  const markersPanelRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeMarkerRef = useRef<string | null>(null)
  const isScrubbingRef = useRef(false)

  const markerEntryPositions = useMemo(() => {
    return entries
      .map((entry, index) => {
        if (entry.type === 'message' && entry.message?.role === 'user') {
          return { entry, index, markerType: 'user' as const }
        }

        const isCompaction =
          entry.type === 'compaction' ||
          (entry.type === 'custom_message' && entry.customType === 'compaction')

        if (isCompaction) {
          return { entry, index, markerType: 'compaction' as const }
        }

        return null
      })
      .filter((item): item is { entry: SessionEntry; index: number; markerType: 'user' | 'compaction' } => Boolean(item))
  }, [entries])

  const getMessagePreview = useCallback((entry: SessionEntry) => {
    const isCompaction =
      entry.type === 'compaction' ||
      (entry.type === 'custom_message' && entry.customType === 'compaction')

    if (isCompaction) {
      const rawSummary =
        entry.summary ||
        (typeof entry.content === 'string' ? entry.content : '') ||
        previewFallback
      const summary = rawSummary.replace(/\s+/g, ' ').trim()
      return summary.length > 80 ? `📦 ${summary.slice(0, 80)}…` : `📦 ${summary}`
    }

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

  const totalSize = rowVirtualizer.getTotalSize()

  const markers = useMemo(() => {
    if (markerEntryPositions.length === 0) return []
    if (totalSize <= 0) return []

    return markerEntryPositions
      .map(({ entry, index, markerType }) => {
        const offsetResult = rowVirtualizer.getOffsetForIndex(index, 'start')
        const estimatedOffset = estimateEntrySize(index) * index
        const entryOffset = offsetResult ? offsetResult[0] : estimatedOffset
        const ratio = entryOffset / totalSize

        return {
          entry,
          top: Math.min(Math.max(ratio, 0), 1),
          preview: getMessagePreview(entry),
          markerType,
        }
      })
      .filter((item): item is ScrollMarker => Boolean(item))
  }, [markerEntryPositions, rowVirtualizer, estimateEntrySize, getMessagePreview, totalSize])

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
