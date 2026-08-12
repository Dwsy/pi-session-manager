import { useEffect, useRef } from 'react'

/**
 * Hidden entry points into the dashboard recap.
 *
 * Two triggers are installed on `window`: the Konami code and simply typing
 * the word "recap". Both stay inert while the user is typing into a real
 * field so the recap can never hijack a search box or a rename input.
 */

/** Dispatched on `window` alongside `onTrigger` so unrelated surfaces can react without prop drilling. */
export const RECAP_EASTER_EGG_EVENT = 'psm-dashboard:recap-easter-egg'

const KONAMI_SEQUENCE = [
  'arrowup',
  'arrowup',
  'arrowdown',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowleft',
  'arrowright',
  'b',
  'a',
] as const

const TYPED_WORD = 'recap'
const TYPED_BUFFER_SIZE = 16
const TYPED_IDLE_RESET_MS = 1500

export interface RecapEasterEggOptions {
  /** Fired when any hidden trigger completes. */
  onTrigger: () => void
  /** When false the listeners are not installed at all. */
  enabled?: boolean
}

function advanceKonami(progress: number, key: string): number {
  if (key === KONAMI_SEQUENCE[progress]) return progress + 1
  // A wrong key still counts as a fresh start when it opens the sequence.
  return key === KONAMI_SEQUENCE[0] ? 1 : 0
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true
  }
  return target instanceof HTMLElement && target.isContentEditable
}

export function useRecapEasterEgg(options: RecapEasterEggOptions): void {
  const { onTrigger, enabled = true } = options
  const onTriggerRef = useRef(onTrigger)

  useEffect(() => {
    onTriggerRef.current = onTrigger
  }, [onTrigger])

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    let konamiProgress = 0
    let typed = ''
    let lastTypedAt = 0

    const fire = () => {
      konamiProgress = 0
      typed = ''
      onTriggerRef.current()
      window.dispatchEvent(new CustomEvent(RECAP_EASTER_EGG_EVENT))
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTextEntryTarget(event.target)) return

      const key = event.key.toLowerCase()

      konamiProgress = advanceKonami(konamiProgress, key)
      if (konamiProgress === KONAMI_SEQUENCE.length) {
        fire()
        return
      }

      if (event.key.length !== 1) return

      const now = Date.now()
      if (now - lastTypedAt > TYPED_IDLE_RESET_MS) typed = ''
      lastTypedAt = now
      typed = (typed + key).slice(-TYPED_BUFFER_SIZE)

      if (typed.endsWith(TYPED_WORD)) fire()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled])
}
