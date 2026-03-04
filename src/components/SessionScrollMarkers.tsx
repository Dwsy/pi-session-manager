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
    if (top <= 0.12) return 'bottom'
    if (top >= 0.88) return 'top'
    return 'center'
  }

  return (
    <div
      className={`session-scroll-markers${isMobile ? ' mobile' : ''}`}
      ref={panelRef}
      onPointerDown={isMobile ? onPointerDown : undefined}
      onPointerMove={isMobile ? onPointerMove : undefined}
      onPointerUp={isMobile ? onPointerUp : undefined}
      onPointerLeave={isMobile ? onPointerLeave : undefined}
    >
      {markers.map(({ entry, top, preview, markerType }) => {
        const isActive = activeMarkerId === entry.id
        const tooltipPlacement = getTooltipPlacement(top)
        return (
          <button
            key={entry.id}
            className={`session-scroll-marker session-scroll-marker--${markerType}${isActive ? ' active' : ''}`}
            style={{ top: `${top * 100}%` }}
            data-tooltip-placement={tooltipPlacement}
            onClick={() => onMarkerClick(entry.id)}
            title={preview}
          >
            <span className="session-scroll-marker-tooltip">{preview}</span>
          </button>
        )
      })}
    </div>
  )
}

export default memo(SessionScrollMarkers)
