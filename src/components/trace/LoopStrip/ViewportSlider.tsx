import { useRef, useState, useEffect, useCallback } from 'react'

interface ViewportSliderProps {
  totalDuration: number
  viewportStartMs: number
  viewportEndMs: number
  onChange: (start: number, end: number) => void
}

export default function ViewportSlider({
  totalDuration,
  viewportStartMs,
  viewportEndMs,
  onChange,
}: ViewportSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    mode: 'window' | 'left' | 'right'
    startX: number
    startStart: number
    startEnd: number
  } | null>(null)

  const [local, setLocal] = useState({ start: viewportStartMs, end: viewportEndMs })
  const localRef = useRef(local)

  useEffect(() => {
    localRef.current = local
  }, [local])

  useEffect(() => {
    if (!dragRef.current) {
      setLocal({ start: viewportStartMs, end: viewportEndMs })
    }
  }, [viewportStartMs, viewportEndMs])

  const emitChange = useCallback((start: number, end: number) => {
    setLocal({ start, end })
    onChange(start, end)
  }, [onChange])

  const handlePointerDown = (mode: 'window' | 'left' | 'right') => (e: React.PointerEvent) => {
    if (totalDuration <= 0) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    dragRef.current = {
      mode,
      startX: e.clientX,
      startStart: localRef.current.start,
      startEnd: localRef.current.end,
    }
  }

  const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = useCallback((e) => {
    if (!trackRef.current || totalDuration <= 0) return
    const state = dragRef.current
    if (!state) return

    const rect = trackRef.current.getBoundingClientRect()
    const deltaPct = (e.clientX - state.startX) / rect.width
    const deltaMs = deltaPct * totalDuration
    const minRange = Math.max(totalDuration * 0.01, 1000)

    if (state.mode === 'window') {
      let nextStart = state.startStart + deltaMs
      let nextEnd = state.startEnd + deltaMs
      if (nextStart < 0) { nextEnd -= nextStart; nextStart = 0 }
      if (nextEnd > totalDuration) { nextStart -= nextEnd - totalDuration; nextEnd = totalDuration }
      emitChange(Math.max(0, nextStart), Math.min(totalDuration, nextEnd))
    } else if (state.mode === 'left') {
      const nextStart = Math.max(0, Math.min(state.startStart + deltaMs, state.startEnd - minRange))
      emitChange(nextStart, state.startEnd)
    } else {
      const nextEnd = Math.min(totalDuration, Math.max(state.startEnd + deltaMs, state.startStart + minRange))
      emitChange(state.startStart, nextEnd)
    }
  }, [totalDuration, emitChange])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const startPct = totalDuration > 0 ? (local.start / totalDuration) * 100 : 0
  const widthPct = totalDuration > 0 ? ((local.end - local.start) / totalDuration) * 100 : 100

  return (
    <div className="relative h-2 shrink-0">
      {/* Track background */}
      <div
        ref={trackRef}
        className="absolute inset-0 rounded-full bg-muted/40 overflow-hidden cursor-pointer"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Viewport window */}
        <div
          className="absolute inset-y-0 rounded-full cursor-grab active:cursor-grabbing"
          style={{
            left: `${startPct}%`,
            width: `${widthPct}%`,
            backgroundColor: 'var(--accent)',
            opacity: 0.2,
          }}
          onPointerDown={handlePointerDown('window')}
        >
          {/* Left handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-[var(--accent)] rounded-l-full transition-colors"
            style={{ opacity: 0.6 }}
            onPointerDown={handlePointerDown('left')}
          />
          {/* Right handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-[var(--accent)] rounded-r-full transition-colors"
            style={{ opacity: 0.6 }}
            onPointerDown={handlePointerDown('right')}
          />
        </div>
      </div>
    </div>
  )
}
