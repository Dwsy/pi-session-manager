// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ copyText: vi.fn() }),
}))

vi.mock('@/components/ui/MarkdownContent', () => ({
  default: ({ content }: { content: string }) => (
    <div>
      <a href="#details">details</a>
      <span>{content}</span>
    </div>
  ),
}))

import UserMessage from './UserMessage'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('UserMessage fullscreen interaction', () => {
  it('opens from the message content and closes by clicking the fullscreen content area', () => {
    const { container } = render(
      <UserMessage id="message-1" content={[{ type: 'text', text: 'Long user input' }]} />,
    )

    fireEvent.click(container.querySelector('.user-message-content')!)
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.click(document.querySelector('.user-message-modal-body')!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not close fullscreen when an interactive descendant is clicked', () => {
    const { container } = render(
      <UserMessage id="message-2" content={[{ type: 'text', text: 'Long user input' }]} />,
    )

    fireEvent.click(container.querySelector('.user-message-content')!)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog.querySelector('a')!)

    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('does not open while the user has a non-collapsed text selection', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      toString: () => 'selected text',
    } as Selection)
    const { container } = render(
      <UserMessage id="message-3" content={[{ type: 'text', text: 'Selectable input' }]} />,
    )

    fireEvent.click(container.querySelector('.user-message-content')!)

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
