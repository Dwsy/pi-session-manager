// @vitest-environment jsdom

import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/hooks/useAppearance', () => ({
  useTheme: () => ({ theme: 'dark' }),
}))

import type { SessionEntry } from '@/types'
import activate, { manifest } from './index'

function assistantToolEntry(content: NonNullable<SessionEntry['message']>['content']): SessionEntry {
  return {
    type: 'message',
    id: 'assistant-1',
    timestamp: '2026-05-19T10:00:00.000Z',
    message: {
      role: 'assistant',
      content,
    },
  }
}

function createHostContext(entries: SessionEntry[]) {
  const toolbarItems: Array<{ id: string; render: (props: unknown) => unknown }> = []
  const ctx = {
    manifest,
    psm: {
      sessions: {
        readEntries: vi.fn().mockResolvedValue(entries),
      },
    },
    permissions: { pluginId: manifest.id, permissions: manifest.permissions },
    events: { subscribe: vi.fn() },
    settings: { get: vi.fn((_key, fallback) => fallback), all: vi.fn(() => ({})) },
    i18n: { language: 'en-US', t: vi.fn((_key, fallback) => fallback) },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
    ui: {
      registerAppView: vi.fn(),
      registerAppSidebarView: vi.fn(),
      registerSessionToolbarItem: vi.fn((item) => {
        toolbarItems.push(item)
      }),
      registerSessionPanel: vi.fn(),
      registerSessionTreeView: vi.fn(),
      registerSessionMainView: vi.fn(),
      registerToolRenderer: vi.fn(),
    },
  }

  activate(ctx as never)
  return { ctx, toolbarItems }
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = MockResizeObserver as never
  globalThis.ResizeObserver = MockResizeObserver as never
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  })
})

afterEach(() => {
  cleanup()
})

describe('CodeReviewToolbarButton', () => {
  it('renders read output when session results use the toolResult role', async () => {
    const { toolbarItems } = createHostContext([
      assistantToolEntry([
        {
          type: 'toolCall',
          id: 'call-read',
          name: 'read',
          arguments: { path: 'src/config.ts' },
        },
      ]),
      {
        type: 'message',
        id: 'tool-result-read',
        timestamp: '2026-05-19T10:00:02.000Z',
        message: {
          role: 'toolResult',
          toolCallId: 'call-read',
          toolName: 'read',
          content: [{ type: 'text', text: 'export const value = 42;' }],
        },
      },
    ])

    const toolbar = toolbarItems.find((item) => item.id === 'builtin.code-review.toolbar')
    expect(toolbar).toBeTruthy()

    render(
      toolbar!.render({
        session: { path: '/tmp/session.jsonl' },
      }) as never,
    )

    const reviewButton = await screen.findByRole('button', { name: 'Code review' })
    await waitFor(() => expect((reviewButton as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(reviewButton)

    await waitFor(() => {
      expect(document.body.textContent).toContain('export const value = 42;')
    })
  })
})
