import { useState, useEffect, useRef } from 'react'

/** Default delay before showing loading UI (session switch, lists, splash, etc.). */
export const DEFAULT_DELAYED_LOADING_MS = 500

/**
 * Delayed loading flag — only returns true after `delay` ms of continuous loading.
 * Prevents skeleton/spinner flash for fast operations (e.g. cache hit &lt; 500ms).
 *
 * @param loading  Whether an operation is in progress
 * @param delay    Milliseconds to wait before showing loading UI (default {@link DEFAULT_DELAYED_LOADING_MS})
 */
export function useDelayedLoading(
  loading: boolean,
  delay = DEFAULT_DELAYED_LOADING_MS,
): boolean {
  const [show, setShow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (loading) {
      const startedAt = Date.now()
      timerRef.current = setTimeout(() => {
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