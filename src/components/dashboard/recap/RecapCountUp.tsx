import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

interface RecapCountUpProps {
  value: number
  /** Preformatted final string; when present it is shown verbatim once the animation completes. */
  display?: string
  durationMs?: number
  reducedMotion?: boolean
  className?: string
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3
}

export default function RecapCountUp({
  value,
  display,
  durationMs = 900,
  reducedMotion,
  className = '',
}: RecapCountUpProps) {
  const systemReducedMotion = usePrefersReducedMotion()
  const still = reducedMotion ?? systemReducedMotion
  const [ticking, setTicking] = useState(!still)
  const [current, setCurrent] = useState(still ? value : 0)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    if (still) {
      setTicking(false)
      setCurrent(value)
      return
    }

    // Always restart from zero: a metric must never appear to count from an
    // unrelated previous scene's value.
    setTicking(true)
    setCurrent(0)

    const startedAt = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / Math.max(durationMs, 1))
      setCurrent(Math.round(easeOutCubic(progress) * value))
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step)
        return
      }
      frameRef.current = null
      setTicking(false)
    }

    frameRef.current = requestAnimationFrame(step)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [durationMs, still, value])

  const settled = display ?? value.toLocaleString()
  if (!ticking) return <span className={className}>{settled}</span>

  // The stage wraps each scene in a polite live region, so the ticking digits
  // stay visual-only and assistive tech is handed the final value once.
  return (
    <span className={className}>
      <span aria-hidden="true">{current.toLocaleString()}</span>
      <span className="sr-only">{settled}</span>
    </span>
  )
}
