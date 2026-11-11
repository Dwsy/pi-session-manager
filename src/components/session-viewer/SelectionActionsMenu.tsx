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

export interface SelectionMenuState {
  /** Viewport anchor of the selection bounding rect. */
  rect: DOMRect
  /** True when the menu renders below the selection (not enough room above). */
  flipped: boolean
}

export function selectionMenuStateFor(rect: DOMRect): SelectionMenuState {
  return { rect, flipped: rect.top < MENU_MAX_HEIGHT / 2 + 48 }
}

interface SelectionActionsMenuProps {
  state: SelectionMenuState
  actions: PsmSelectionActionRuntimeRegistration[]
  onRun: (action: PsmSelectionActionRuntimeRegistration) => void
  onClose: () => void
}

/** Floating pill of plugin actions shown next to a transcript text selection. */
export default function SelectionActionsMenu({ state, actions, onRun, onClose }: SelectionActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [actions])

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
      const delta = event.key === 'ArrowDown' ? 1 : -1
      buttons[(activeIndex + delta + buttons.length) % buttons.length]?.focus()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const { rect, flipped } = state
  const anchorX = Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140)
  const anchorY = flipped ? rect.bottom + 10 : rect.top - 10

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
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
            className="psm-selection-menu__item"
            onClick={() => onRun(action)}
          >
            <Icon className="psm-selection-menu__icon" aria-hidden="true" />
            <span className="psm-selection-menu__label">{action.title}</span>
          </button>
        )
      })}
    </div>
  )
}
