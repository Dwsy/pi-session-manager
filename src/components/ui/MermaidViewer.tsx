import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minus, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MermaidDiagram } from '@/utils/mermaidOndine'
import { clampMermaidZoom, formatMermaidZoom, MERMAID_ZOOM_MAX, MERMAID_ZOOM_STEP, minMermaidZoom } from '@/utils/mermaidZoom'

interface MermaidViewerProps {
  diagram: MermaidDiagram
  returnFocus: RefObject<HTMLElement>
  onClose: () => void
}

interface ZoomAnchor {
  clientX: number
  clientY: number
  x: number
  y: number
}

interface Point {
  x: number
  y: number
}

function getPinchGeometry(points: Map<number, Point>) {
  const [first, second] = Array.from(points.values())
  if (!first || !second) return null
  return {
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  }
}

/** Full-window diagram viewer. The SVG is rendered separately so its internal IDs remain unique. */
export default function MermaidViewer({ diagram, returnFocus, onClose }: MermaidViewerProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLDivElement>(null)
  const diagramRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const autoFitRef = useRef(true)
  const scaleRef = useRef(1)
  const anchorRef = useRef<ZoomAnchor | null>(null)
  const pointersRef = useRef(new Map<number, Point>())
  const dragRef = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null)
  const pinchRef = useRef<{ distance: number; scale: number; center: Point } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [scale, setScale] = useState(1)
  const [fitScale, setFitScale] = useState(1)

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const measure = () => {
      if (!canvas.clientWidth || !canvas.clientHeight) return
      const nextFit = Math.min(
        Math.max(1, canvas.clientWidth - 48) / diagram.width,
        Math.max(1, canvas.clientHeight - 48) / diagram.height,
        1,
      )
      setFitScale(nextFit)
      if (autoFitRef.current) {
        scaleRef.current = nextFit
        setScale(nextFit)
      }
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(canvas)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [diagram.width, diagram.height])

  const changeZoom = useCallback((next: number, clientX?: number, clientY?: number) => {
    const canvas = canvasRef.current
    const svg = diagramRef.current
    if (!canvas || !svg) return
    const canvasRect = canvas.getBoundingClientRect()
    const svgRect = svg.getBoundingClientRect()
    const x = clientX ?? canvasRect.left + canvasRect.width / 2
    const y = clientY ?? canvasRect.top + canvasRect.height / 2
    const nextScale = clampMermaidZoom(next, fitScale)
    if (nextScale === scaleRef.current) return
    if (svgRect.width && svgRect.height) {
      anchorRef.current = {
        clientX: x,
        clientY: y,
        x: (x - svgRect.left) / svgRect.width,
        y: (y - svgRect.top) / svgRect.height,
      }
    }
    autoFitRef.current = false
    scaleRef.current = nextScale
    setScale(nextScale)
  }, [fitScale])

  useLayoutEffect(() => {
    const svg = diagramRef.current
    if (!anchorRef.current || !svg) return
    const applyAnchor = () => {
      const anchor = anchorRef.current
      const canvas = canvasRef.current
      if (!anchor || !canvas) return
      const rect = svg.getBoundingClientRect()
      if (Math.abs(rect.width - diagram.width * scale) > 1) return
      canvas.scrollLeft += rect.left + rect.width * anchor.x - anchor.clientX
      canvas.scrollTop += rect.top + rect.height * anchor.y - anchor.clientY
      anchorRef.current = null
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(applyAnchor)
    observer?.observe(svg)
    const frame = requestAnimationFrame(applyAnchor)
    return () => {
      observer?.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [diagram.width, scale])

  const fit = useCallback(() => {
    anchorRef.current = null
    autoFitRef.current = true
    scaleRef.current = fitScale
    setScale(fitScale)
    if (canvasRef.current) {
      canvasRef.current.scrollLeft = 0
      canvasRef.current.scrollTop = 0
    }
  }, [fitScale])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.deltaY === 0) return
      event.preventDefault()
      let unit = 1
      if (event.deltaMode === 1) unit = 16
      if (event.deltaMode === 2) unit = canvas.clientHeight
      const delta = Math.max(-400, Math.min(400, event.deltaY * unit))
      changeZoom(scaleRef.current * Math.pow(MERMAID_ZOOM_STEP, -delta / 100), event.clientX, event.clientY)
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [changeZoom])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (returnFocus.current?.isConnected) returnFocus.current.focus()
    }
  }, [returnFocus])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        onClose()
      } else if (!event.ctrlKey && !event.metaKey && (event.key === '+' || event.key === '=')) {
        event.preventDefault()
        event.stopPropagation()
        changeZoom(scaleRef.current * MERMAID_ZOOM_STEP)
      } else if (!event.ctrlKey && !event.metaKey && event.key === '-') {
        event.preventDefault()
        event.stopPropagation()
        changeZoom(scaleRef.current / MERMAID_ZOOM_STEP)
      } else if (!event.ctrlKey && !event.metaKey && event.key === '0') {
        event.preventDefault()
        event.stopPropagation()
        fit()
      } else if (event.key === 'Tab') {
        const dialog = canvasRef.current?.closest<HTMLElement>('[role="dialog"]')
        const focusable = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [changeZoom, fit, onClose])

  const label = (key: string, fallback: string) => t('components.mermaid.' + key, { defaultValue: fallback })
  const zoomLabel = t('components.mermaid.zoomLevel', {
    defaultValue: 'Zoom {{value}}',
    value: formatMermaidZoom(scale),
  })

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || pointersRef.current.size >= 2) return
    const canvas = event.currentTarget
    const point = { x: event.clientX, y: event.clientY }
    pointersRef.current.set(event.pointerId, point)
    canvas.setPointerCapture?.(event.pointerId)
    if (pointersRef.current.size === 1) {
      dragRef.current = { id: event.pointerId, ...point, left: canvas.scrollLeft, top: canvas.scrollTop }
      setDragging(true)
    } else {
      const geometry = getPinchGeometry(pointersRef.current)
      if (geometry) {
        pinchRef.current = { ...geometry, distance: Math.max(geometry.distance, 1), scale: scaleRef.current }
      }
      dragRef.current = null
      setDragging(false)
    }
    event.preventDefault()
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return
    const canvas = event.currentTarget
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const pinch = pinchRef.current
    if (pinch) {
      const geometry = getPinchGeometry(pointersRef.current)
      if (!geometry) return
      canvas.scrollLeft -= geometry.center.x - pinch.center.x
      canvas.scrollTop -= geometry.center.y - pinch.center.y
      pinch.center = geometry.center
      changeZoom(pinch.scale * geometry.distance / pinch.distance, geometry.center.x, geometry.center.y)
      return
    }
    const drag = dragRef.current
    if (drag?.id === event.pointerId) {
      canvas.scrollLeft = drag.left - (event.clientX - drag.x)
      canvas.scrollTop = drag.top - (event.clientY - drag.y)
    }
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.delete(event.pointerId)) return
    const canvas = event.currentTarget
    pinchRef.current = null
    const remaining = pointersRef.current.entries().next().value
    if (remaining) {
      const [id, point] = remaining
      dragRef.current = { id, ...point, left: canvas.scrollLeft, top: canvas.scrollTop }
      setDragging(true)
    } else {
      dragRef.current = null
      setDragging(false)
    }
    if (canvas.hasPointerCapture?.(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
  }

  return createPortal(
    <div className="mermaid-fullscreen" role="dialog" aria-modal="true" aria-label={label('title', 'Mermaid diagram')}>
      <div className="mermaid-fullscreen-header">
        <div className="mermaid-fullscreen-heading">
          <h3 className="mermaid-fullscreen-title">{label('title', 'Mermaid diagram')}</h3>
          <span className="mermaid-fullscreen-hint">{label('hint', 'Drag to pan · Ctrl / ⌘ and scroll to zoom')}</span>
        </div>
        <div className="mermaid-fullscreen-actions">
          <button type="button" className="mermaid-icon-button" onClick={() => changeZoom(scaleRef.current / MERMAID_ZOOM_STEP)}
            aria-label={label('zoomOut', 'Zoom out')} title={label('zoomOut', 'Zoom out')}
            disabled={scale <= minMermaidZoom(fitScale)}><Minus aria-hidden="true" /></button>
          <output className="mermaid-zoom-value" aria-label={zoomLabel} aria-live="polite">
            {formatMermaidZoom(scale)}
          </output>
          <button type="button" className="mermaid-icon-button" onClick={() => changeZoom(scaleRef.current * MERMAID_ZOOM_STEP)}
            aria-label={label('zoomIn', 'Zoom in')} title={label('zoomIn', 'Zoom in')}
            disabled={scale >= MERMAID_ZOOM_MAX}><Plus aria-hidden="true" /></button>
          <button type="button" className="mermaid-icon-button" onClick={fit}
            aria-label={label('fit', 'Fit diagram to view')} title={label('fit', 'Fit diagram to view')}>
            <Maximize2 aria-hidden="true" />
          </button>
          <button type="button" className="mermaid-zoom-label" onClick={() => { autoFitRef.current = false; changeZoom(1) }}
            aria-label={label('actualSize', 'Actual size (100%)')} title={label('actualSize', 'Actual size (100%)')}>1:1</button>
          <button ref={closeRef} type="button" className="mermaid-icon-button" onClick={onClose}
            aria-label={label('close', 'Close diagram')} title={label('close', 'Close diagram')}>
            <X aria-hidden="true" />
          </button>
        </div>
      </div>
      <div ref={canvasRef} className={'mermaid-fullscreen-canvas' + (dragging ? ' is-dragging' : '')}
        role="region" tabIndex={0} aria-label={label('canvasHint', 'Drag to pan; pinch or use the zoom controls to zoom')}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}>
        <div className="mermaid-fullscreen-stage">
          <div ref={diagramRef} className="mermaid-fullscreen-diagram"
            style={{ width: diagram.width * scale, height: diagram.height * scale }}
            dangerouslySetInnerHTML={{ __html: diagram.svg }} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
