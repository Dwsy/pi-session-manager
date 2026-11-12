// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import HighlightPopover from './HighlightPopover'

// jsdom has no layout engine: offsetWidth/offsetHeight are always 0 and
// getBoundingClientRect() returns zeros. We fake both, plus a ResizeObserver
// whose callback we can fire to simulate async plugin content growing.
let cardWidth = 300
let cardHeight = 100
let fireResize: () => void = () => undefined

function rect(top: number, bottom: number, left = 200, width = 120): DOMRect {
  return { top, bottom, left, width, right: left + width, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

let host: HTMLDivElement
let root: Root
let anchor: HTMLElement

beforeEach(() => {
  cardWidth = 300
  cardHeight = 100
  fireResize = () => undefined
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => cardWidth })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => cardHeight })
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => cardHeight })
  class ResizeObserverStub {
    constructor(private readonly cb: () => void) {
      fireResize = () => this.cb()
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  host = document.createElement('div')
  document.body.append(host)
  anchor = document.createElement('mark')
  document.body.append(anchor)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  anchor.remove()
  vi.unstubAllGlobals()
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight
})

function render(anchorRect: DOMRect) {
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(anchorRect)
  act(() => {
    root.render(
      <HighlightPopover
        state={{ anchor, content: <div>note</div> }}
        onClose={() => undefined}
      />,
    )
  })
  const card = document.querySelector<HTMLElement>('.psm-highlight-popover')!
  return card
}

describe('HighlightPopover placement', () => {
  it('sits fully above the highlighted line without covering it', () => {
    const card = render(rect(300, 320))
    const top = Number.parseFloat(card.style.top)
    const bottom = top + cardHeight
    expect(bottom).toBeLessThanOrEqual(300)
    expect(card.dataset.flipped).toBe('false')
  })

  it('repositions when async plugin content grows instead of covering the line', () => {
    cardHeight = 60
    const card = render(rect(300, 320))
    const firstTop = Number.parseFloat(card.style.top)
    expect(firstTop + cardHeight).toBeLessThanOrEqual(300)

    // Plugin content arrives and the card becomes much taller. Without a
    // ResizeObserver-driven recompute the card would extend down over the mark.
    cardHeight = 220
    act(() => {
      fireResize()
    })
    const nextTop = Number.parseFloat(card.style.top)
    expect(nextTop).not.toBe(firstTop)
    expect(nextTop + cardHeight).toBeLessThanOrEqual(300)
  })

  it('flips below the line when there is not enough room above', () => {
    cardHeight = 200
    const card = render(rect(50, 70))
    const top = Number.parseFloat(card.style.top)
    expect(card.dataset.flipped).toBe('true')
    expect(top).toBeGreaterThanOrEqual(70)
  })

  it('caps the card in a short viewport so it never covers the line', () => {
    vi.stubGlobal('innerHeight', 240)
    cardHeight = 400
    const card = render(rect(120, 140))
    // The card is taller than both sides; it must scroll internally and stay
    // clear of the highlighted line instead of covering it.
    expect(card.style.maxHeight).not.toBe('')
    expect(card.style.overflowY).toBe('auto')
    const top = Number.parseFloat(card.style.top)
    const height = Number.parseFloat(card.style.maxHeight)
    expect(top + height).toBeLessThanOrEqual(120)
  })

  it('keeps a caret pointing at the highlighted words', () => {
    const card = render(rect(300, 320))
    const caret = card.querySelector<HTMLElement>('.psm-highlight-popover__caret')
    expect(caret).not.toBeNull()
    expect(caret!.style.left).not.toBe('')
  })
})
