import { useEffect, useRef } from 'react'
import {
  Bookmark,
  Copy,
  NotebookPen,
  Search,
  Sparkles,
  Star,
  Tag,
  type LucideIcon,
} from 'lucide-react'

import type { PsmSelectionActionRuntimeRegistration } from '@/plugins/runtime-host'

const ICONS: Record<string, LucideIcon> = {
  bookmark: Bookmark,
  copy: Copy,
  note: NotebookPen,
  search: Search,
  sparkles: Sparkles,
  star: Star,
  tag: Tag,
}

const MENU_MAX_HEIGHT = 320

/** Viewport rect for a range, tolerant of environments without Range layout. */
export function rectForRange(range: Range): DOMRect {
  try {
    const rect = range.getBoundingClientRect()
    if (rect && typeof rect.top === 'number') return rect
  } catch {
    // jsdom and detached ranges have no layout; fall back to the host element.
  }
  const node = range.commonAncestorContainer
  const element = node instanceof Element ? node : node.parentElement
  return (
    element?.getBoundingClientRect?.() ??
    ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 } as DOMRect)
  )
}

/**
 * Per-line boxes of the selection. A multi-line selection paints one strip per
 * line (like WeChat Read's underline) instead of one giant block. Falls back
 * to the bounding rect where layout is unavailable (jsdom).
 */
export function rectsForRange(range: Range): DOMRect[] {
  try {
    const rects = Array.from(range.getClientRects()).filter(
      (rect) => rect && typeof rect.top === 'number' && rect.width > 0 && rect.height > 0,
    )
    if (rects.length > 0) return rects
  } catch {
    // No layout information; the overlay falls back to the bounding rect.
  }
  return [rectForRange(range)]
}

export interface SelectionMenuState {
  /** Viewport anchor of the selection bounding rect. */
  rect: DOMRect
  /** Line boxes used to paint the persistent "what did I select" underline. */
  rects: DOMRect[]
  /** True when the menu renders below the selection (not enough room above). */
  flipped: boolean
}

export function selectionMenuStateFor(rect: DOMRect, rects: DOMRect[] = [rect]): SelectionMenuState {
  return { rect, rects, flipped: rect.top < MENU_MAX_HEIGHT / 2 + 48 }
}

interface SelectionActionsMenuProps {
  state: SelectionMenuState
  actions: PsmSelectionActionRuntimeRegistration[]
  onRun: (action: PsmSelectionActionRuntimeRegistration) => void
  onClose: () => void
}

/**
 * Floating pill of plugin actions shown next to a transcript text selection.
 *
 * Deliberately does NOT auto-focus its first button: moving focus away from the
 * document fades the browser's native selection highlight, which is the one
 * cue telling the user *which* text they just selected. Keyboard users can
 * still Tab/arrow into the menu.
 */
export default function SelectionActionsMenu({ state, actions, onRun, onClose }: SelectionActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      if (buttons.length === 0) return
      event.preventDefault()
      const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
      const start = activeIndex === -1 ? (event.key === 'ArrowDown' ? -1 : 0) : activeIndex
      const delta = event.key === 'ArrowDown' ? 1 : -1
      buttons[(start + delta + buttons.length) % buttons.length]?.focus()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const { rect, flipped } = state
  const anchorX = Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140)
  const anchorY = flipped ? rect.bottom + 10 : rect.top - 10
  // The caret sits under the middle of the selected text, not the middle of
  // the viewport-clamped menu, so it keeps pointing at the right words.
  const caretX = Math.min(Math.max(rect.left + rect.width / 2 - anchorX, -anchorX + 20), 120)

  return (
    <>
      {/* Persistent underline stays visible while the toolbar is open, even
          after the native selection loses focus. One strip per line box. */}
      <div className="psm-selection-underline" aria-hidden="true">
        {state.rects.map((line, index) => (
          <span
            key={index}
            className="psm-selection-underline__line"
            style={{ left: line.left, top: line.bottom - 2, width: line.width }}
          />
        ))}
      </div>
      <div
        ref={menuRef}
        role="menu"
        aria-orientation="vertical"
        aria-label="Selection actions"
        className={`psm-selection-menu ${flipped ? 'psm-selection-menu--flipped' : ''}`}
        style={{ left: anchorX, top: anchorY }}
        onMouseDown={(event) => event.preventDefault()}
      >
        {actions.map((action) => {
          const Icon = ICONS[action.icon ?? 'bookmark'] ?? Bookmark
          return (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              tabIndex={0}
              className="psm-selection-menu__item"
              onClick={() => onRun(action)}
            >
              <Icon className="psm-selection-menu__icon" aria-hidden="true" />
              <span className="psm-selection-menu__label">{action.title}</span>
            </button>
          )
        })}
        <span
          className="psm-selection-menu__caret"
          style={{ left: `calc(50% + ${caretX}px)` }}
          aria-hidden="true"
        />
      </div>
    </>
  )
}
