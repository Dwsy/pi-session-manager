import { memo, useCallback, useMemo, useState, type CSSProperties } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export interface TimelineNavItem {
  entryId: string
  role: string
  preview: string
  markerType: 'user' | 'assistant' | 'compaction'
  /** 0-1, position in the scroll area */
  top: number
}

interface SessionTimelineNavProps {
  items: TimelineNavItem[]
  onNavigate: (entryId: string) => void
}

const MAX_TIMELINE_DOTS = 60

function sampleItems(items: TimelineNavItem[], max: number): TimelineNavItem[] {
  if (items.length <= max) return items
  if (max <= 1) return [items[items.length - 1]]
  const sampled: TimelineNavItem[] = []
  const step = (items.length - 1) / (max - 1)
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * step)
    const item = items[idx]
    if (!item) continue
    if (sampled[sampled.length - 1]?.entryId === item.entryId) continue
    sampled.push(item)
  }
  const last = items[items.length - 1]
  if (sampled[sampled.length - 1]?.entryId !== last.entryId) {
    sampled.push(last)
  }
  return sampled
}

function SessionTimelineNav({ items, onNavigate }: SessionTimelineNavProps) {
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null)
  const [isHovered, setIsHovered] = useState(false)

  const sampled = useMemo(() => sampleItems(items, MAX_TIMELINE_DOTS), [items])

  // Track active (currently visible) entry — for now use hovered, can be enhanced with scroll tracking
  const activeEntryId = hoveredEntryId

  const handleDotClick = useCallback(
    (entryId: string) => {
      onNavigate(entryId)
    },
    [onNavigate],
  )

  if (sampled.length === 0) return null

  return (
    <div
      className="absolute right-3 top-1/2 -translate-y-1/2 z-20"
      style={{ height: 'min(320px, 60vh)' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false)
        setHoveredEntryId(null)
      }}
      role="navigation"
      aria-label="Message timeline navigation"
    >
      <div className="relative w-full h-full flex flex-col items-center">
        {/* Previous message button */}
        <button
          onClick={() => {
            const firstVisible = sampled.find((item) => item.top >= 0.05)
            const idx = sampled.indexOf(firstVisible ?? sampled[0])
            if (idx > 0) onNavigate(sampled[idx - 1].entryId)
            else if (sampled.length > 0) onNavigate(sampled[0].entryId)
          }}
          className={`
            absolute -top-7 left-1/2 -translate-x-1/2
            inline-flex items-center justify-center rounded-full
            w-7 h-7 p-1
            text-muted-foreground/70 hover:text-foreground hover:bg-secondary
            transition-all duration-200
            ${isHovered ? 'opacity-100' : 'opacity-0'}
          `}
          aria-label="Previous message"
          title="Previous message"
        >
          <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>

        {/* Timeline dots — absolutely positioned by top % */}
        {sampled.map((item) => {
          const isActive = activeEntryId === item.entryId
          const isHoveredDot = hoveredEntryId === item.entryId

          let dotStyle: CSSProperties = {
            position: 'absolute',
            top: `${item.top * 100}%`,
            right: 0,
            transform: 'translateY(-50%)',
            width: isActive || isHoveredDot ? '14px' : '10px',
            height: isActive || isHoveredDot ? '4px' : '3px',
            borderRadius: '999px',
            transition: 'all 0.15s ease',
            background: isActive
              ? 'var(--accent)'
              : isHoveredDot
                ? 'rgba(var(--accent-rgb), 0.8)'
                : item.markerType === 'compaction'
                  ? 'rgba(168, 139, 250, 0.5)'
                  : item.role === 'user'
                    ? 'rgba(var(--accent-rgb), 0.4)'
                    : 'rgba(var(--accent-rgb), 0.2)',
            boxShadow: isActive
              ? '0 0 0 1px rgba(var(--accent-rgb), 0.15), 0 4px 10px rgba(var(--accent-rgb), 0.15)'
              : 'none',
          }

          return (
            <button
              key={item.entryId}
              onClick={() => handleDotClick(item.entryId)}
              onMouseEnter={() => setHoveredEntryId(item.entryId)}
              onMouseLeave={() => setHoveredEntryId(null)}
              className="absolute group"
              style={{
                top: `${item.top * 100}%`,
                right: 0,
                transform: 'translateY(-50%)',
                width: '40px',
                height: '16px',
              }}
              aria-label={`${item.role} message: ${item.preview}`}
              title={item.preview}
            >
              <span style={dotStyle} />

              {/* Tooltip */}
              {isHoveredDot && (
                <div
                  className="absolute right-6 top-1/2 -translate-y-1/2
                    bg-card/95 backdrop-blur-xl border border-border/60
                    rounded-xl px-3 py-2.5 min-w-[200px] max-w-[280px]
                    shadow-lg text-left z-50
                    opacity-0 translate-x-1
                    group-hover:opacity-100 group-hover:translate-x-0
                    transition-all duration-150 ease-out
                    pointer-events-none"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className="w-[3px] min-w-[3px] self-stretch rounded-full"
                      style={{ background: 'var(--accent)', boxShadow: '0 0 8px rgba(var(--accent-rgb), 0.2)' }}
                    />
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-muted-foreground mb-0.5 uppercase tracking-wide">
                        {item.role}
                      </div>
                      <div className="text-[12px] text-foreground leading-relaxed line-clamp-3">
                        {item.preview}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </button>
          )
        })}

        {/* Next message button */}
        <button
          onClick={() => {
            const lastVisible = [...sampled].reverse().find((item) => item.top <= 0.95)
            const idx = sampled.indexOf(lastVisible ?? sampled[sampled.length - 1])
            if (idx < sampled.length - 1) onNavigate(sampled[idx + 1].entryId)
            else if (sampled.length > 0) onNavigate(sampled[sampled.length - 1].entryId)
          }}
          className={`
            absolute -bottom-7 left-1/2 -translate-x-1/2
            inline-flex items-center justify-center rounded-full
            w-7 h-7 p-1
            text-muted-foreground/70 hover:text-foreground hover:bg-secondary
            transition-all duration-200
            ${isHovered ? 'opacity-100' : 'opacity-0'}
          `}
          aria-label="Next message"
          title="Next message"
        >
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}

export default memo(SessionTimelineNav)
