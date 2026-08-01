// @vitest-environment jsdom

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/transport', () => ({
  isTauri: vi.fn(),
}))

import { isTauri } from '@/transport'
import { useContextMenuOverride } from './useContextMenuOverride'

describe('useContextMenuOverride', () => {
  beforeEach(() => {
    vi.mocked(isTauri).mockReturnValue(true)
  })

  afterEach(() => {
    document.body.replaceChildren()
    vi.clearAllMocks()
  })

  it('keeps the native context menu for embedded data images', () => {
    const { unmount } = renderHook(() => useContextMenuOverride())
    const image = document.createElement('img')
    image.src = 'data:image/png;base64,AAAA'
    document.body.append(image)

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    image.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    unmount()
  })

  it('still suppresses the native context menu for non-editable app surfaces', () => {
    const { unmount } = renderHook(() => useContextMenuOverride())
    const surface = document.createElement('div')
    document.body.append(surface)

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    surface.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    unmount()
  })
})
