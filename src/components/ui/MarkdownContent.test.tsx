// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MarkdownContent from './MarkdownContent'

const invokeMock = vi.fn()
const isTauriMock = vi.fn(() => true)

vi.mock('@/transport', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  isTauri: () => isTauriMock(),
}))

describe('MarkdownContent link handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
    isTauriMock.mockReset()
    isTauriMock.mockReturnValue(true)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  it('confirms then opens http links outside the webview', async () => {
    render(<MarkdownContent content="[Docs](https://example.com/docs)" />)

    fireEvent.click(screen.getByRole('link', { name: 'Docs' }))

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('https://example.com/docs'))
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('open_url_in_system', { url: 'https://example.com/docs' })
    })
  })

  it('opens file links with the default desktop app without confirmation', async () => {
    render(<MarkdownContent content="[Note](file:///Users/me/My%20Note.md)" />)

    fireEvent.click(screen.getByRole('link', { name: 'Note' }))

    expect(window.confirm).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('open_path_with_default_app', { path: '/Users/me/My Note.md' })
    })
  })

  it('blocks unsupported protocols', () => {
    render(<MarkdownContent content="[Bad](javascript:alert(1))" />)

    fireEvent.click(screen.getByRole('link', { name: 'Bad' }))

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Unsupported link protocol'))
    expect(invokeMock).not.toHaveBeenCalled()
  })
})
