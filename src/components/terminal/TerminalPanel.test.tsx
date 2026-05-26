// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.fn(async (command: string) => {
  if (command === 'get_available_shells') return [['zsh', '/bin/zsh']]
  if (command === 'get_default_shell') return '/bin/zsh'
  return null
})

vi.mock('@/transport', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  listen: vi.fn(async () => vi.fn()),
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    options: Record<string, unknown> = {}
    loadAddon() {}
    open() {}
    attachCustomKeyEventHandler() {}
    fit() {}
    get rows() { return 24 }
    get cols() { return 80 }
    onData() {}
    write() {}
    writeln() {}
    clear() {}
    hasSelection() { return false }
    getSelection() { return '' }
    input() {}
    focus() {}
    dispose() {}
  },
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}))

vi.mock('@/hooks/useResolvedTheme', () => ({
  useResolvedTheme: () => 'dark',
}))

const copyTextMock = vi.fn()
const readTextMock = vi.fn(async () => '')

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ copyText: copyTextMock, readText: readTextMock }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

import TerminalPanel from './TerminalPanel'

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

describe('TerminalPanel', () => {
  beforeEach(() => {
    invokeMock.mockClear()
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('requires a second click before hiding the terminal panel', async () => {
    const onClose = vi.fn()

    render(
      <TerminalPanel
        isOpen
        scopeKey="session:test"
        cwd="/tmp"
        onClose={onClose}
      />,
    )

    await screen.findByRole('button', { name: 'Close terminal tab' })
    const closePanelButton = await screen.findByRole('button', { name: 'Hide terminal panel' })

    fireEvent.click(closePanelButton)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(await screen.findByRole('button', { name: 'Click again to hide terminal panel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('requires a second click before closing a terminal tab', async () => {
    render(
      <TerminalPanel
        isOpen
        scopeKey="session:test"
        cwd="/tmp"
        onClose={() => {}}
      />,
    )

    const closeButton = await screen.findByRole('button', { name: 'Close terminal tab' })
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('terminal_create', expect.anything())
    })
    invokeMock.mockClear()

    fireEvent.click(closeButton)
    expect(invokeMock).not.toHaveBeenCalledWith('terminal_close', expect.anything())

    fireEvent.click(await screen.findByRole('button', { name: 'Click again to close terminal' }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('terminal_close', { id: 'session:test:term-1' })
    })
  })
})
