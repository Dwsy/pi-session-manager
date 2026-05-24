import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import type { TraceEvent } from '@/types/trace'
import { deriveLoops, type AgentLoop } from './deriveLoops'
import LoopSegment from './LoopSegment'
import LoopTooltip from './LoopTooltip'
import ViewportSlider from './ViewportSlider'

interface LoopStripProps {
  totalDuration: number
  events: TraceEvent[]
  viewportStartMs: number
  viewportEndMs: number
  onChange: (start: number, end: number) => void
}

const MAX_WIDTH_PCT = 40
const MIN_WIDTH_PCT = 3

export default function LoopStrip({
  totalDuration,
  events,
  viewportStartMs,
  viewportEndMs,
  onChange,
}: LoopStripProps) {
  const loops = useMemo(() => deriveLoops(events), [events])
  const [selectedLoop, setSelectedLoop] = useState<AgentLoop | null>(null)
  const [hoveredLoop, setHoveredLoop] = useState<AgentLoop | null>(null)
  const [hoverX, setHoverX] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // Calculate width percentages for each loop, capped
  const loopWidths = useMemo(() => {
    if (loops.length === 0 || totalDuration <= 0) return []

    const rawWidths = loops.map((l) => (l.durationMs / totalDuration) * 100)

    // Apply min/max constraints
    let widths = rawWidths.map((w) => Math.max(MIN_WIDTH_PCT, Math.min(MAX_WIDTH_PCT, w)))

    // Normalize to 100%
    const sum = widths.reduce((a, b) => a + b, 0)
    if (sum > 0) {
      widths = widths.map((w) => (w / sum) * 100)
    }

    return widths
  }, [loops, totalDuration])

  const handleSelectLoop = useCallback((loop: AgentLoop) => {
    if (selectedLoop?.index === loop.index) {
      // Deselect → reset to full range
      setSelectedLoop(null)
      onChange(0, totalDuration)
    } else {
      setSelectedLoop(loop)
      // Add small padding around the loop
      const padding = loop.durationMs * 0.05
      onChange(
        Math.max(0, loop.startMs - padding),
        Math.min(totalDuration, loop.endMs + padding),
      )
    }
  }, [selectedLoop, totalDuration, onChange])

  const handleHoverLoop = useCallback((loop: AgentLoop | null) => {
    setHoveredLoop(loop)
  }, [])

  const handleHoverPosition = useCallback((x: number) => {
    setHoverX(x)
  }, [])

  if (loops.length === 0) {
    return (
      <div className="h-12 border-t border-border bg-background/95 shrink-0 px-3 flex items-center">
        <span className="text-[11px] text-muted-foreground">No events</span>
      </div>
    )
  }

  return (
    <div className="border-t border-border bg-background/95 shrink-0 px-3 py-2">
      {/* Loop segments row */}
      <div
        ref={containerRef}
        className="relative flex items-end gap-0.5 mb-2"
      >
        {loops.map((loop, i) => (
          <LoopSegment
            key={loop.index}
            loop={loop}
            widthPct={loopWidths[i] || MIN_WIDTH_PCT}
            selected={selectedLoop?.index === loop.index}
            hovered={hoveredLoop?.index === loop.index}
            onSelect={handleSelectLoop}
            onHover={handleHoverLoop}
            onHoverPosition={handleHoverPosition}
          />
        ))}

        {/* Tooltip */}
        {hoveredLoop && containerWidth > 0 && (
          <LoopTooltip
            loop={hoveredLoop}
            position={{ x: hoverX, y: 0 }}
            containerWidth={containerWidth}
          />
        )}
      </div>

      {/* Viewport slider */}
      <ViewportSlider
        totalDuration={totalDuration}
        viewportStartMs={viewportStartMs}
        viewportEndMs={viewportEndMs}
        onChange={onChange}
      />
    </div>
  )
}
