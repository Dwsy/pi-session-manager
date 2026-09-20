// @vitest-environment jsdom
//
// Regression tests for the app-wide crash on Pi sessions whose messages store
// `content` as a plain string (e.g. `role: "system"`):
//
//   TypeError: e.filter is not a function
//     at contentToText (SessionEntryRenderer.tsx)
//
// The entry renderer is the last line of defence before a bad payload trips the
// app-wide error boundary, so it must coerce non-array content itself.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

vi.mock('@/components/ui/MarkdownContent', () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}))

// Leaf renderers become prop probes: these tests assert on the content that the
// entry renderer coerces before handing it over.
vi.mock('@/components/messages/UserMessage', () => ({
  default: ({ content }: { content: unknown }) => {
    const blocks = Array.isArray(content) ? content : []
    return (
      <div data-testid="user-message">
        <div
          data-array={String(Array.isArray(content))}
          data-types={blocks.map((block: { type?: string }) => block?.type).join(',')}
        >
          {blocks.map((block: { text?: string }) => block?.text ?? '').join('')}
        </div>
      </div>
    )
  },
}))

vi.mock('@/components/messages/AssistantMessage', () => ({
  default: ({ content }: { content: unknown }) => {
    const blocks = Array.isArray(content) ? content : []
    return (
      <div data-testid="assistant-message">
        <div
          data-array={String(Array.isArray(content))}
          data-types={blocks.map((block: { type?: string }) => block?.type).join(',')}
        >
          {blocks.map((block: { text?: string }) => block?.text ?? '').join('')}
        </div>
      </div>
    )
  },
}))

import { renderSessionEntry } from './SessionEntryRenderer'
import type { SessionEntry } from '@/types'

function messageEntry(role: string, content: unknown): SessionEntry {
  return {
    type: 'message',
    id: `${role}-1`,
    timestamp: '2026-04-09T10:00:00Z',
    message: { role, content },
  } as unknown as SessionEntry
}

function probeNode(testId: string): HTMLElement {
  return screen.getByTestId(testId).firstElementChild as HTMLElement
}

describe('renderSessionEntry string content coercion', () => {
  it('renders a system message whose content is a raw string', () => {
    render(<>{renderSessionEntry(messageEntry('system', 'You are a helpful assistant.'))}</>)

    expect(screen.getByTestId('markdown').textContent).toBe('You are a helpful assistant.')
  })

  it('renders a developer message whose content is a raw string', () => {
    render(<>{renderSessionEntry(messageEntry('developer', 'Follow the house style.'))}</>)

    expect(screen.getByTestId('markdown').textContent).toBe('Follow the house style.')
  })

  it('does not throw for an empty string body', () => {
    render(<>{renderSessionEntry(messageEntry('system', ''))}</>)

    expect(screen.getByTestId('markdown').textContent).toBe('')
  })

  it('coerces user message content into content parts', () => {
    render(<>{renderSessionEntry(messageEntry('user', 'hello there'))}</>)

    expect(probeNode('user-message').getAttribute('data-array')).toBe('true')
    expect(probeNode('user-message').getAttribute('data-types')).toBe('text')
    expect(screen.getByTestId('user-message').textContent).toBe('hello there')
  })

  it('coerces assistant preview content into content parts', () => {
    render(
      <>
        {renderSessionEntry(messageEntry('assistant', 'streamed text'), new Map(), '', false, true)}
      </>,
    )

    expect(probeNode('assistant-message').getAttribute('data-array')).toBe('true')
    expect(screen.getByTestId('assistant-message').textContent).toBe('streamed text')
  })
})
