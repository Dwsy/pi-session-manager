// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import AppDesktopContent from '../AppDesktopContent'

function setPlatform(platform: string, userAgent = platform) {
  Object.defineProperty(window.navigator, 'platform', {
    configurable: true,
    value: platform,
  })
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  })
}

describe('AppDesktopContent drag region', () => {
  afterEach(() => {
    cleanup()
  })

  it('does not render a drag region on Windows', () => {
    setPlatform('Win32', 'Windows')

    const { container } = render(
      <AppDesktopContent
        isTauriRuntime
        showTerminal={false}
        terminalMaximized={false}
        mainContent={<div>Main</div>}
      />,
    )

    expect(container.querySelector('[data-tauri-drag-region]')).toBeNull()
  })

  it('renders a drag region on macOS', () => {
    setPlatform('MacIntel', 'Macintosh')

    const { container } = render(
      <AppDesktopContent
        isTauriRuntime
        showTerminal={false}
        terminalMaximized={false}
        mainContent={<div>Main</div>}
      />,
    )

    expect(container.querySelector('[data-tauri-drag-region]')).not.toBeNull()
  })
})
