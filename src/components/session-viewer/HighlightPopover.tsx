import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface HighlightPopoverState {
  anchor: HTMLElement
  content: ReactNode
}

interface HighlightPopoverProps {
  state: HighlightPopoverState
  onClose: () => void
}

const POPOVER_GAP = 12
const POPOVER_EDGE = 8
const POPOVER_MAX_WIDTH = 340

interface PopoverPosition {
  left: number
  top: number
  flipped: boolean
  caretX: number
  /** Cap the card so a tall annotation can never cover the highlighted line. */
  maxHeight: number | null
}

/**
 * Floating card hosting plugin popover content for an activated text highlight.
 *
 * WeChat Read-style behavior: the card never covers the highlighted line. Its
 * content is rendered by a plugin and often arrives asynchronously, so the
 * card grows *after* first paint — position is recomputed on every size change
 * (ResizeObserver) and on scroll/resize, not just once on mount.
 */
export default function HighlightPopover({ state, onClose }: HighlightPopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PopoverPosition | null>(null)

  const reposition = useCallback(() => {
    const card = cardRef.current
    if (!card) return
    const anchorRect = state.anchor.getBoundingClientRect()
    const { offsetWidth, offsetHeight } = card
    if (offsetWidth === 0 || offsetHeight === 0) return
    // Use the *natural* content height. Once maxHeight clips the card,
    // offsetHeight shrinks; judging by it alone would oscillate (fits →
    // uncap → grows → cap…). scrollHeight keeps the full content height.
    const naturalHeight = Math.max(offsetHeight, card.scrollHeight || 0)

    // Available space on each side of the highlighted line, minus the gap
    // that keeps the card from touching (and thereby covering) the text.
    const roomAbove = anchorRect.top - POPOVER_GAP - POPOVER_EDGE
    const roomBelow = window.innerHeight - anchorRect.bottom - POPOVER_GAP - POPOVER_EDGE
    const flipped = naturalHeight > roomAbove && roomBelow > roomAbove
    const available = flipped ? roomBelow : roomAbove
    // If neither side fits, let the card scroll internally rather than grow
    // over the annotation target. This is the "遮挡" edge case.
    const maxHeight =
      naturalHeight > available && available > 80 ? Math.floor(available) : null
    const effectiveHeight = maxHeight ?? naturalHeight
    const left = Math.min(
      Math.max(anchorRect.left + anchorRect.width / 2 - offsetWidth / 2, POPOVER_EDGE),
      window.innerWidth - offsetWidth - POPOVER_EDGE,
    )
    // Both placements sit fully outside the anchor's own line box.
    const top = flipped
      ? anchorRect.bottom + POPOVER_GAP
      : anchorRect.top - POPOVER_GAP - effectiveHeight

    const caretCenterX = anchorRect.left + anchorRect.width / 2
    const caretX = Math.min(Math.max(caretCenterX - left, 16), offsetWidth - 16)
    setPosition((previous) => {
      if (
        previous &&
        previous.left === left &&
        previous.top === top &&
        previous.flipped === flipped &&
        previous.maxHeight === maxHeight &&
        Math.abs(previous.caretX - caretX) < 0.5
      ) {
        return previous
      }
      return { left, top, flipped, caretX, maxHeight }
    })
  }, [state.anchor])

  useLayoutEffect(() => {
    reposition()
  }, [reposition, state.content])

  // Plugin content (bookmark note, editor) mounts/expands asynchronously;
  // also react to viewport changes and transcript scrolling.
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reposition) : null
    observer?.observe(card)
    const onViewportChange = () => reposition()
    window.addEventListener('resize', onViewportChange)
    document.addEventListener('scroll', onViewportChange, { passive: true, capture: true })
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', onViewportChange)
      document.removeEventListener('scroll', onViewportChange, true)
    }
  }, [reposition])

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
      aria-label="Bookmark annotation"
      data-flipped={position?.flipped ? 'true' : 'false'}
      className={`psm-highlight-popover ${position?.flipped ? 'psm-highlight-popover--flipped' : ''}`}
      style={{
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        maxWidth: POPOVER_MAX_WIDTH,
        maxHeight: position?.maxHeight ?? undefined,
        overflowY: position?.maxHeight ? 'auto' : undefined,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {state.content}
      {/* Caret points back at the highlighted words, like WeChat Read. */}
      <span
        className="psm-highlight-popover__caret"
        style={{ left: position?.caretX ?? '50%' }}
        aria-hidden="true"
      />
    </div>
  )
}
