import { memo, type PointerEvent, type RefObject } from 'react'
import type { ScrollMarker } from '../hooks/useSessionScrollMarkers'

interface SessionScrollMarkersProps {
  markers: ScrollMarker[]
  activeMarkerId: string | null
  isMobile: boolean
  show: boolean
  panelRef: RefObject<HTMLDivElement>
  onMarkerClick: (entryId: string) => void
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerLeave: (event: PointerEvent) => void
}

function SessionScrollMarkers({
  markers,
  activeMarkerId,
  isMobile,
  show,
  panelRef,
  onMarkerClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
}: SessionScrollMarkersProps) {
  if (markers.length === 0) return null
  if (isMobile && !show) return null

  const getTooltipPlacement = (top: number): 'top' | 'center' | 'bottom' => {
    const edgeThreshold = isMobile ? 0.18 : 0.12
    if (top <= edgeThreshold) return 'bottom'
    if (top >= 1 - edgeThreshold) return 'top'
    return 'center'
  }

  return (
    <div
      className={`session-scroll-markers${isMobile ? ' mobile' : ''}${activeMarkerId ? ' has-active-marker' : ''}`}
      ref={panelRef}
      onPointerDown={isMobile ? onPointerDown : undefined}
      onPointerMove={isMobile ? onPointerMove : undefined}
      onPointerUp={isMobile ? onPointerUp : undefined}
      onPointerLeave={isMobile ? onPointerLeave : undefined}
      role={isMobile ? 'navigation' : undefined}
      aria-label={isMobile ? 'Session message markers' : undefined}
    >
      {markers.map(({ entry, top, preview, markerType }) => {
        const isActive = activeMarkerId === entry.id
        const tooltipPlacement = getTooltipPlacement(top)
        return (
          <button
            type="button"
            key={entry.id}
            className={`session-scroll-marker session-scroll-marker--${markerType}${isActive ? ' active' : ''}`}
            style={{ top: `${top * 100}%` }}
            data-tooltip-placement={tooltipPlacement}
            onClick={isMobile ? undefined : () => onMarkerClick(entry.id)}
            title={isMobile ? undefined : preview}
            aria-label={preview}
          >
            <span className="session-scroll-marker-dot" aria-hidden="true" />
            {!isMobile && (
              <span className="session-scroll-marker-tooltip">
                <span className="session-scroll-marker-tooltip-accent" aria-hidden="true" />
                <span className="session-scroll-marker-tooltip-text">{preview}</span>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export default memo(SessionScrollMarkers)
