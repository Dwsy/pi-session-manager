// @vitest-environment jsdom
import { fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RECAP_EASTER_EGG_EVENT, useRecapEasterEgg } from './useRecapEasterEgg'

const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
]

function press(keys: string[], target: Element = document.body, init: KeyboardEventInit = {}): void {
  for (const key of keys) {
    fireEvent.keyDown(target, { key, ...init })
  }
}

function mount(enabled = true) {
  const onTrigger = vi.fn()
  const view = renderHook(() => useRecapEasterEgg({ onTrigger, enabled }))
  return { onTrigger, ...view }
}

describe('useRecapEasterEgg', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires once on the full Konami code and dispatches the announce event', () => {
    const onEvent = vi.fn()
    window.addEventListener(RECAP_EASTER_EGG_EVENT, onEvent)
    const { onTrigger } = mount()

    press(KONAMI)

    expect(onTrigger).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledTimes(1)

    window.removeEventListener(RECAP_EASTER_EGG_EVENT, onEvent)
  })

  it('resets progress after firing so trailing keys do not re-fire', () => {
    const { onTrigger } = mount()

    press(KONAMI)
    press(['a', 'a', 'b'])

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('resets on a wrong key mid-sequence', () => {
    const { onTrigger } = mount()

    press(['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'x'])
    press(['ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'])

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('restarts progress when the wrong key is itself the first key', () => {
    const { onTrigger } = mount()

    press(['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowUp'])
    press(['ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'B', 'A'])

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('fires when the word is typed, including as a suffix of noise', () => {
    const { onTrigger } = mount()

    press(['q', 'z', 'r', 'e', 'c', 'a', 'p'])

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('drops a half-typed fragment after the idle gap', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const { onTrigger } = mount()

    press(['r', 'e', 'c'])
    vi.setSystemTime(Date.now() + 2000)
    press(['a', 'p'])

    expect(onTrigger).not.toHaveBeenCalled()

    press(['r', 'e', 'c', 'a', 'p'])

    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('stays inert while a text field or contenteditable has focus', () => {
    const { onTrigger } = mount()
    const input = document.createElement('input')
    const select = document.createElement('select')
    const editable = document.createElement('div')
    // jsdom never sets isContentEditable (it has no editing host), so stub the property the hook reads.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    document.body.append(input, select, editable)

    press(['r', 'e', 'c', 'a', 'p'], input)
    press(KONAMI, input)
    press(['r', 'e', 'c', 'a', 'p'], select)
    press(['r', 'e', 'c', 'a', 'p'], editable)

    expect(onTrigger).not.toHaveBeenCalled()

    input.remove()
    select.remove()
    editable.remove()
  })

  it('ignores keys held with a modifier', () => {
    const { onTrigger } = mount()

    press(['r', 'e', 'c', 'a', 'p'], document.body, { metaKey: true })
    press(KONAMI, document.body, { ctrlKey: true })

    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('installs nothing when disabled and removes listeners on unmount', () => {
    const disabled = mount(false)
    press(['r', 'e', 'c', 'a', 'p'])
    expect(disabled.onTrigger).not.toHaveBeenCalled()

    const active = mount()
    active.unmount()
    press(['r', 'e', 'c', 'a', 'p'])
    expect(active.onTrigger).not.toHaveBeenCalled()
  })
})
