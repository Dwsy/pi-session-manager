// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { getDeletePopoverPosition } from './DeleteSessionPopover'

describe('getDeletePopoverPosition', () => {
  it('falls back to centered placement when no anchor is provided', () => {
    expect(
      getDeletePopoverPosition({
        popoverHeight: 180,
        viewportWidth: 1200,
        viewportHeight: 800,
      }),
    ).toEqual({ top: 310, left: 460 })
  })

  it('keeps the popover inside the viewport when anchored near bottom-right', () => {
    expect(
      getDeletePopoverPosition({
        anchorRect: {
          left: 1100,
          right: 1140,
          top: 760,
          bottom: 792,
        } as DOMRect,
        popoverHeight: 180,
        viewportWidth: 1200,
        viewportHeight: 800,
      }),
    ).toEqual({ top: 572, left: 860 })
  })

  it('supports point anchors from context menus', () => {
    expect(
      getDeletePopoverPosition({
        anchorPoint: { x: 1180, y: 40 },
        popoverHeight: 180,
        viewportWidth: 1200,
        viewportHeight: 800,
      }),
    ).toEqual({ top: 48, left: 900 })
  })
})
