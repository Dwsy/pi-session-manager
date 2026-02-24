import { useEffect, useRef } from 'react'

interface UsePageUpDownScrollOptions {
  isEnabled?: boolean
}

function isEditableTarget(element: Element | null): boolean {
  if (!element) return false

  const editable = element.closest(
    'input, textarea, select, [contenteditable="true"], [role="textbox"]',
  )
  return Boolean(editable)
}

function isTerminalTarget(element: Element | null): boolean {
  if (!element) return false
  return Boolean(element.closest('[data-terminal-root="true"]'))
}

function isScrollableContainer(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element)
  const overflowY = style.overflowY
  const isScrollableOverflow = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
  if (!isScrollableOverflow) return false

  return element.scrollHeight - element.clientHeight > 1
}

function findScrollableAncestor(element: Element | null): HTMLElement | null {
  let current: Element | null = element
  while (current) {
    if (current instanceof HTMLElement && isScrollableContainer(current)) {
      return current
    }
    current = current.parentElement
  }
  return null
}

/**
 * Enable browser-like PageUp/PageDown scrolling inside the app
 *
 * Scrolls the nearest scrollable ancestor of the currently focused element
 * and avoids interfering with text inputs and the embedded terminal
 */
export function usePageUpDownScroll(options: UsePageUpDownScrollOptions = {}) {
  const { isEnabled = true } = options
  const enabledRef = useRef(isEnabled)

  useEffect(() => {
    enabledRef.current = isEnabled
  }, [isEnabled])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!enabledRef.current) return
      if (e.defaultPrevented) return

      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key !== 'PageDown' && e.key !== 'PageUp') return

      const active = document.activeElement
      const baseElement = active instanceof Element
        ? active
        : e.target instanceof Element
          ? e.target
          : null

      if (isTerminalTarget(baseElement)) return
      if (isEditableTarget(baseElement)) return

      const scrollContainer = findScrollableAncestor(baseElement)
      if (!scrollContainer) return

      const pageDelta = Math.max(200, Math.floor(scrollContainer.clientHeight * 0.9))
      const direction = e.key === 'PageDown' ? 1 : -1

      e.preventDefault()

      scrollContainer.scrollBy({
        top: direction * pageDelta,
        behavior: 'auto',
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
