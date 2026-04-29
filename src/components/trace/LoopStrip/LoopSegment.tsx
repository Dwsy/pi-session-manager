import { useRef, useCallback } from 'react'
import type { AgentLoop } from './deriveLoops'
import LoopPhaseBar from './LoopPhaseBar'

interface LoopSegmentProps {
  loop: AgentLoop
  widthPct: number
  selected: boolean
  hovered: boolean
  onSelect: (loop: AgentLoop) => void
  onHover: (loop: AgentLoop | null) => void
  onHoverPosition: (x: number) => void
}

export default function LoopSegment({
  loop,
  widthPct,
  selected,
  hovered,
  onSelect,
  onHover,
  onHoverPosition,
}: LoopSegmentProps) {
  const ref = useRef<HTMLDivElement>(null)

  const handleMouseMove = useCallback(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    onHoverPosition(rect.left + rect.width / 2)
  }, [onHoverPosition])

  return (
    <div
      ref={ref}
      className="flex flex-col gap-1 cursor-pointer select-none group"
      style={{ width: `${widthPct}%`, minWidth: 0 }}
      onClick={() => onSelect(loop)}
      onMouseEnter={() => {
        onHover(loop)
        handleMouseMove()
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => onHover(null)}
    >
      {/* Phase bar */}
      <div className="h-3 w-full">
        <LoopPhaseBar
          phases={loop.phases}
          durationMs={loop.durationMs}
          hasError={loop.hasError}
          selected={selected}
          hovered={hovered}
        />
      </div>

      {/* Label row */}
      <div className="flex items-center gap-1 min-w-0">
        <span
          className={`text-[10px] font-mono truncate transition-colors ${
            selected
              ? 'text-foreground font-semibold'
              : hovered
                ? 'text-foreground'
                : 'text-muted-foreground'
          }`}
        >
          L{loop.index}
        </span>
        {loop.hasError && (
          <span className="text-[9px] text-destructive">⚠</span>
        )}
        {loop.toolCount > 0 && (
          <span className="text-[9px] text-muted-foreground font-mono">
            {loop.toolCount}⚙
          </span>
        )}
      </div>
    </div>
  )
}
