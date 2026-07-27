// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

;(globalThis as Record<string, unknown>).__PSM_HOST_REACT__ = React

let CacheUsagePanel: typeof import('./ui').CacheUsagePanel

beforeAll(async () => {
  CacheUsagePanel = (await import('./ui')).CacheUsagePanel
})

afterEach(() => {
  document.body.innerHTML = ''
})

function createI18n() {
  return {
    language: 'en-US',
    t: (key: string, fallback: string, values?: Record<string, unknown>) => {
      if (!values) return fallback
      return fallback.replace(/{{(\w+)}}/g, (_, name: string) => String(values[name] ?? ''))
    },
  }
}

function createClient() {
  return {
    readEntries: vi.fn(async () => [
      {
        type: 'message',
        id: 'a1',
        timestamp: '2026-05-23T10:01:00Z',
        message: {
          role: 'assistant',
          provider: 'anthropic',
          model: 'claude-4',
          usage: { input: 100, output: 20, cacheRead: 900, cacheWrite: 0 },
        },
      },
    ]),
  }
}

async function renderPanel(open = true): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <CacheUsagePanel
        client={createClient()}
        i18n={createI18n() as never}
        session={{ path: '/tmp/session.jsonl', name: 'Example session' }}
        open={open}
        recentTurns={8}
        onClose={vi.fn()}
      />,
    )
  })
  return { container, root }
}

describe('CacheUsagePanel', () => {
  it('uses the overview as the default shared session panel', async () => {
    const { container, root } = await renderPanel()

    expect(container.textContent).toContain('Overview')
    expect(container.textContent).toContain('Signals')
    expect(container.querySelector('[data-no-window-drag]')?.className).toContain('psm-session-plugin-panel')

    await act(async () => root.unmount())
  })

  it('does not render when the panel is closed', async () => {
    const { container, root } = await renderPanel(false)

    expect(container.textContent).toBe('')

    await act(async () => root.unmount())
  })
})
