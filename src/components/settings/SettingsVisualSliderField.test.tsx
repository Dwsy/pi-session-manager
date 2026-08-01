// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SettingsVisualSliderField from './SettingsVisualSliderField'

describe('SettingsVisualSliderField', () => {
  it('anchors the progress fill at the start and sizes it from the current value', () => {
    const onChange = vi.fn()
    const { container } = render(
      <SettingsVisualSliderField
        label="Font size"
        value={15}
        min={10}
        max={20}
        onChange={onChange}
      />,
    )

    const fill = container.querySelector('.absolute.left-0') as HTMLElement
    expect(fill.style.width).toBe('50%')

    fireEvent.change(container.querySelector('input[type="range"]')!, {
      target: { value: '18' },
    })
    expect(onChange).toHaveBeenCalledWith(18)
  })
})
