import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface HighlightPopoverState {
  anchor: HTMLElement
  content: ReactNode
}

interface HighlightPopoverProps {
  state: HighlightPopoverState
  onClose: () => void
}

const POPOVER_GAP = 10
const POPOVER_MAX_WIDTH = 340

/** Floating card hosting plugin popover content for an activated text highlight. */
export default function HighlightPopover({ state, onClose }: HighlightPopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number; flipped: boolean } | null>(null)

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const anchorRect = state.anchor.getBoundingClientRect()
    const { offsetWidth, offsetHeight } = card
    const flipped = anchorRect.top - POPOVER_GAP - offsetHeight < 8
    const left = Math.min(
      Math.max(anchorRect.left + anchorRect.width / 2 - offsetWidth / 2, 8),
      window.innerWidth - offsetWidth - 8,
    )
    const top = flipped
      ? anchorRect.bottom + POPOVER_GAP
      : anchorRect.top - POPOVER_GAP - offsetHeight
    setPosition({ left, top, flipped })
  }, [state])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (cardRef.current?.contains(target)) return
      if (state.anchor.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [onClose, state.anchor])

  return (
    <div
      ref={cardRef}
      role="dialog"
      className="psm-highlight-popover"
      style={{
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        maxWidth: POPOVER_MAX_WIDTH,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {state.content}
    </div>
  )
}
