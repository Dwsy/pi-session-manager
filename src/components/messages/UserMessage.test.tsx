// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react'
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

class ControlledResizeObserver {
  static instances: ControlledResizeObserver[] = []
  callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    ControlledResizeObserver.instances.push(this)
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

afterEach(() => {
  ControlledResizeObserver.instances = []
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('UserMessage interactions', () => {
  it('does not open the fullscreen dialog when message content is clicked', () => {
    const { container } = render(
      <UserMessage id="message-1" content={[{ type: 'text', text: 'Long user input' }]} />,
    )

    fireEvent.click(container.querySelector('.user-message-content')!)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the fullscreen dialog via the explicit expand button and closes on overlay click', () => {
    render(
      <UserMessage id="message-2" content={[{ type: 'text', text: 'Long user input' }]} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'components.userMessage.expand' }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.click(document.querySelector('.user-message-modal-overlay')!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('collapses skill XML into a one-line block and opens the full skill in a dialog', () => {
    const skillBody = '# Skill instructions\n\nKeep the service boundary intact.'
    const trailingText = '只读：仔细看历史对话，我之前都跑了很多测试了。'

    render(
      <UserMessage
        id="message-skill"
        content={[{
          type: 'text',
          text: `<skill name="use-pi-session" location="/Users/me/.agents/skills/use-pi-session/SKILL.md">\n${skillBody}\n</skill>\n\n${trailingText}`,
        }]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Open skill use-pi-session' })).toBeTruthy()
    expect(screen.queryByText(skillBody)).toBeNull()
    expect(screen.getByText(/只读：仔细看历史对话/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Open skill use-pi-session' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'SKILL:use-pi-session' })).toBeTruthy()
    expect(screen.getByRole('dialog').textContent).toContain(skillBody)
    expect(screen.getByRole('dialog').textContent).toContain('/Users/me/.agents/skills/use-pi-session/SKILL.md')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows an inline toggle when content is truncated and expands in place', () => {
    vi.stubGlobal('ResizeObserver', ControlledResizeObserver)

    const { container } = render(
      <UserMessage id="message-3" content={[{ type: 'text', text: 'Very long user input' }]} />,
    )

    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()

    const body = container.querySelector('.user-message-body-truncated') as HTMLElement
    Object.defineProperty(body, 'scrollHeight', { configurable: true, value: 600 })
    Object.defineProperty(body, 'clientHeight', { configurable: true, value: 220 })

    const observer = ControlledResizeObserver.instances.at(-1)!
    act(() => {
      observer.callback([], observer as unknown as ResizeObserver)
    })

    const toggle = screen.getByRole('button', { name: 'Show more' })
    expect(body.classList.contains('is-truncated')).toBe(true)

    fireEvent.click(toggle)

    expect(body.classList.contains('is-expanded')).toBe(true)
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy()
  })
})
