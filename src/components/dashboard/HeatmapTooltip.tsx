import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { ExternalLink, Filter } from 'lucide-react'
import type { HeatmapPoint } from '@/types'

interface HeatmapTooltipProps {
  point: HeatmapPoint
  children: React.ReactNode
  onViewDetails?: (point: HeatmapPoint) => void
  onFilterProject?: (projectName: string) => void
}

type Placement = 'top' | 'bottom'

interface TooltipPosition {
  x: number
  y: number
  placement: Placement
  arrowX: number
}

export default function HeatmapTooltip({
  point,
  children,
  onViewDetails,
  onFilterProject,
}: HeatmapTooltipProps) {
  const { t } = useTranslation()
  const anchorRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const enterTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<TooltipPosition | null>(null)

  const openTooltip = useCallback(() => {
    clearTimeout(leaveTimerRef.current)
    clearTimeout(enterTimerRef.current)
    enterTimerRef.current = setTimeout(() => setOpen(true), 80)
  }, [])

  const scheduleClose = useCallback(() => {
    clearTimeout(enterTimerRef.current)
    clearTimeout(leaveTimerRef.current)
    leaveTimerRef.current = setTimeout(() => {
      setOpen(false)
      setPosition(null)
    }, 180)
  }, [])

  const closeImmediately = useCallback(() => {
    clearTimeout(enterTimerRef.current)
    clearTimeout(leaveTimerRef.current)
    setOpen(false)
    setPosition(null)
  }, [])

  const cancelClose = useCallback(() => {
    clearTimeout(leaveTimerRef.current)
  }, [])

  const handleAnchorLeave = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && tooltipRef.current?.contains(nextTarget)) {
      return
    }
    scheduleClose()
  }, [scheduleClose])

  const handleTooltipLeave = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && anchorRef.current?.contains(nextTarget)) {
      return
    }
    scheduleClose()
  }, [scheduleClose])

  const calculatePosition = useCallback(() => {
    if (!anchorRef.current || !tooltipRef.current) return

    const anchorRect = anchorRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()

    const viewportPadding = 12
    const gap = 10
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const anchorCenterX = anchorRect.left + anchorRect.width / 2

    let x = anchorCenterX - tooltipRect.width / 2
    x = Math.max(viewportPadding, Math.min(x, viewportWidth - tooltipRect.width - viewportPadding))

    const topY = anchorRect.top - tooltipRect.height - gap
    const bottomY = anchorRect.bottom + gap
    const canPlaceTop = topY >= viewportPadding
    const canPlaceBottom = bottomY + tooltipRect.height <= viewportHeight - viewportPadding

    let placement: Placement = 'top'
    let y = topY

    if (!canPlaceTop && canPlaceBottom) {
      placement = 'bottom'
      y = bottomY
    } else if (!canPlaceTop && !canPlaceBottom) {
      placement = 'bottom'
      y = Math.max(viewportPadding, Math.min(bottomY, viewportHeight - tooltipRect.height - viewportPadding))
    }

    const rawArrowX = anchorCenterX - x
    const arrowX = Math.max(14, Math.min(rawArrowX, tooltipRect.width - 14))

    setPosition({ x, y, placement, arrowX })
  }, [])

  useLayoutEffect(() => {
    if (!open) return

    calculatePosition()

    const syncPosition = () => calculatePosition()
    window.addEventListener('resize', syncPosition)
    window.addEventListener('scroll', syncPosition, true)

    return () => {
      window.removeEventListener('resize', syncPosition)
      window.removeEventListener('scroll', syncPosition, true)
    }
  }, [open, calculatePosition])

  useEffect(() => {
    return () => {
      clearTimeout(enterTimerRef.current)
      clearTimeout(leaveTimerRef.current)
    }
  }, [])

  const formattedDate = format(parseISO(point.date), 'EEEE, MMM dd, yyyy')
  const activityLabels = [
    t('dashboard.activityLevels.none', 'No Activity'),
    t('dashboard.activityLevels.low', 'Low'),
    t('dashboard.activityLevels.low', 'Low'),
    t('dashboard.activityLevels.medium', 'Medium'),
    t('dashboard.activityLevels.high', 'High'),
    t('dashboard.activityLevels.veryHigh', 'Very High'),
  ]
  const activityLabel = activityLabels[point.level] || activityLabels[0]

  const handleViewDetails = () => {
    closeImmediately()
    onViewDetails?.(point)
  }

  const handleFilterProject = () => {
    if (!point.top_project) return
    closeImmediately()
    onFilterProject?.(point.top_project)
  }

  return (
    <div
      ref={anchorRef}
      className="block w-full"
      onMouseEnter={openTooltip}
      onMouseLeave={handleAnchorLeave}
      onPointerDownCapture={(event) => {
        if (!tooltipRef.current?.contains(event.target as Node)) closeImmediately()
      }}
      onKeyDownCapture={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !tooltipRef.current?.contains(event.target as Node)) closeImmediately()
      }}
    >
      {children}

      {open && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[130]"
          style={{
            left: position?.x ?? -9999,
            top: position?.y ?? -9999,
            opacity: position ? 1 : 0,
            transition: 'none',
            pointerEvents: 'auto',
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={handleTooltipLeave}
        >
          <div className="relative rounded-md border border-border bg-popover shadow-lg px-3.5 py-3 min-w-[240px] max-w-[300px]">
            <div className="text-sm font-semibold text-foreground mb-2">{formattedDate}</div>

            <div className="mb-3">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-muted-foreground font-medium">{activityLabel}</span>
                <span className="font-semibold text-foreground tabular-nums">{point.level}/5</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-success"
                  style={{ width: `${(point.level / 5) * 100}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('dashboard.stats.messages', 'Messages')}
                </div>
                <div className="font-semibold text-foreground tabular-nums">
                  {point.total_messages.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('dashboard.stats.sessions', 'Sessions')}
                </div>
                <div className="font-semibold text-foreground tabular-nums">{point.session_count}</div>
              </div>
            </div>

            {point.top_project && (
              <button
                type="button"
                className="mt-3 pt-2.5 border-t border-border/15 w-full text-left hover:text-primary focus-ring"
                onClick={handleFilterProject}
              >
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t('dashboard.stats.topProject', 'Top Project')}
                </div>
                <div className="font-medium text-foreground truncate flex items-center gap-1.5">
                  <Filter className="w-3 h-3 text-muted-foreground" />
                  <span className="truncate">{point.top_project}</span>
                </div>
              </button>
            )}

            <div className="mt-3 pt-2.5 border-t border-border/15 flex items-center justify-end gap-2">
              <button
                type="button"
                className="text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 focus-ring inline-flex items-center gap-1"
                onClick={handleViewDetails}
              >
                <ExternalLink className="w-3 h-3" />
                {t('dashboard.heatmapTooltip.viewDetails', 'View details')}
              </button>
            </div>

            <div
              className="absolute w-2.5 h-2.5 rotate-45 bg-background/88 border-white/20"
              style={position?.placement === 'top'
                ? {
                    bottom: '-5px',
                    left: `${position.arrowX}px`,
                    marginLeft: '-5px',
                    borderBottomWidth: '1px',
                    borderRightWidth: '1px',
                  }
                : {
                    top: '-5px',
                    left: `${position?.arrowX ?? 0}px`,
                    marginLeft: '-5px',
                    borderTopWidth: '1px',
                    borderLeftWidth: '1px',
                  }}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
