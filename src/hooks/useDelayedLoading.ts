import { useState, useEffect, useRef } from 'react'

/**
 * Delayed loading flag — only returns true after `delay` ms of continuous loading.
 * Prevents skeleton flash for fast operations (e.g. search < 500ms).
 *
 * @param loading  Whether an operation is in progress
 * @param delay    Milliseconds to wait before showing loading UI (default 500)
 */
export function useDelayedLoading(loading: boolean, delay = 500): boolean {
  const [show, setShow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (loading) {
      const startedAt = Date.now()
      timerRef.current = setTimeout(() => {
        // Only show if still loading after delay
        if (Date.now() - startedAt >= delay) {
          setShow(true)
        }
      }, delay)
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = undefined
      }
      setShow(false)
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = undefined
      }
    }
  }, [loading, delay])

  return show
}
