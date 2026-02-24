import type { PointerEvent, RefObject } from 'react'
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

export default function SessionScrollMarkers({
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

  return (
    <div
      className={`session-scroll-markers${isMobile ? ' mobile' : ''}`}
      ref={panelRef}
      onPointerDown={isMobile ? onPointerDown : undefined}
      onPointerMove={isMobile ? onPointerMove : undefined}
      onPointerUp={isMobile ? onPointerUp : undefined}
      onPointerLeave={isMobile ? onPointerLeave : undefined}
    >
      {markers.map(({ entry, top, preview }) => {
        const isActive = activeMarkerId === entry.id
        return (
          <button
            key={entry.id}
            className={`session-scroll-marker${isActive ? ' active' : ''}`}
            style={{ top: `${top * 100}%` }}
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
