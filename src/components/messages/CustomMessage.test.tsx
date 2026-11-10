// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CustomMessage from './CustomMessage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

vi.mock('@/components/ui/MarkdownContent', () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown-rendered">{content}</div>
  ),
}))

vi.mock('./SubagentCustomMessage', () => ({
  default: ({ customType, content }: { customType?: string; content?: any }) => (
    <div data-testid="subagent-custom-message">
      <span>{customType}</span>
      <span>{typeof content === 'string' ? content : JSON.stringify(content)}</span>
    </div>
  ),
}))

describe('CustomMessage', () => {
  it('renders default custom message with max height and overflow scroll classes', () => {
    const { container } = render(
      <CustomMessage
        customType="test-hook"
        content="Long custom extension output"
      />,
    )

    const hookMessage = container.querySelector('.hook-message')
    expect(hookMessage).toBeTruthy()

    const contentWrapper = container.querySelector('.markdown-content')
    expect(contentWrapper).toBeTruthy()
    expect(contentWrapper?.className).toContain('max-h-[min(60vh,520px)]')
    expect(contentWrapper?.className).toContain('overflow-y-auto')

    expect(screen.getByTestId('markdown-rendered').textContent).toBe('Long custom extension output')
    expect(container.querySelector('.hook-type')?.textContent).toBe('[test-hook]')
  })

  it('stringifies non-string content (e.g. JSON objects)', () => {
    const payload = { status: 'ok', count: 42 }
    render(<CustomMessage customType="json-hook" content={payload} />)

    expect(screen.getByTestId('markdown-rendered').textContent).toBe(JSON.stringify(payload))
  })

  it('renders timestamp when provided', () => {
    const timestamp = '2026-04-03T10:00:00.000Z'
    const { container } = render(
      <CustomMessage
        customType="test-hook"
        content="Hello"
        timestamp={timestamp}
      />,
    )

    expect(container.querySelector('.message-timestamp')).toBeTruthy()
  })

  it('uses translation fallback when customType is not provided', () => {
    const { container } = render(<CustomMessage content="No type" />)

    expect(container.querySelector('.hook-type')?.textContent).toBe('[components.customMessage.custom]')
  })

  it('delegates to SubagentCustomMessage for subagent message types', () => {
    render(
      <CustomMessage
        customType="subagent_result"
        content={{ summary: 'Agent finished task' }}
      />,
    )

    expect(screen.getByTestId('subagent-custom-message')).toBeTruthy()
    expect(screen.queryByTestId('markdown-rendered')).toBeNull()
  })
})
