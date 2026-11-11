// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Bookmark, RegistryEntry } from './bookmark'
import { explorerState } from './explorerState'
import { BookmarksAppSidebar, BookmarksAppView, type BookmarkStoreLike } from './explorer'

const i18n = {
  language: 'en-US',
  t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    values
      ? fallback.replace(/{{(\w+)}}/g, (_, name: string) => String(values[name] ?? ''))
      : fallback,
}

function entry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'bm-1',
    sessionPath: '/demo/ai/session-011.jsonl',
    entryId: 'm1',
    quote: 'beta delta',
    note: 'keep this',
    sessionName: 'Fallback UX',
    projectPath: '/demo/ai',
    createdAt: '2026-11-11T10:00:00.000Z',
    ...overrides,
  }
}

function asBookmark(row: RegistryEntry): Bookmark {
  return {
    id: row.id,
    sessionPath: row.sessionPath,
    anchor: { entryId: row.entryId, textQuote: { exact: row.quote } },
    quote: row.quote,
    note: row.note,
    sessionName: row.sessionName,
    projectPath: row.projectPath,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
  }
}

function createStore(overrides: Partial<BookmarkStoreLike> = {}): BookmarkStoreLike {
  const rows = [
    entry(),
    entry({ id: 'bm-2', sessionPath: '/demo/infra/session-002.jsonl', quote: 'canary-safe fix path', note: undefined, sessionName: 'Canary rollout', projectPath: '/demo/infra', createdAt: '2026-11-11T11:00:00.000Z' }),
  ]
  return {
    listForSession: vi.fn(async (path: string) => rows.filter((row) => row.sessionPath === path).map(asBookmark)),
    listRecent: vi.fn(async () => rows),
    search: vi.fn(async () => rows.map(asBookmark)),
    updateNote: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
    consumePendingNoteId: vi.fn(() => null),
    ...overrides,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  explorerState.set({ grouping: 'session', projectFilter: null, sortOrder: 'newest' })
})

async function render(node: React.ReactElement): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(node)
  })
  return { container, root }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('BookmarksAppView', () => {
  it('groups the full list by session with counts', async () => {
    const { container } = await render(
      <BookmarksAppView store={createStore()} i18n={i18n} active />,
    )
    await flush()
    expect(container.textContent).toContain('Fallback UX')
    expect(container.textContent).toContain('Canary rollout')
    expect(container.textContent).toContain('beta delta')
    expect(container.textContent).toContain('canary-safe fix path')
  })

  it('groups by project when the explorer state says so', async () => {
    explorerState.set({ grouping: 'project' })
    const { container } = await render(
      <BookmarksAppView store={createStore()} i18n={i18n} active />,
    )
    await flush()
    expect(container.textContent).toContain('ai')
    expect(container.textContent).toContain('infra')
  })

  it('filters by the project selected in the sidebar', async () => {
    explorerState.set({ projectFilter: '/demo/infra' })
    const { container } = await render(
      <BookmarksAppView store={createStore()} i18n={i18n} active />,
    )
    await flush()
    expect(container.textContent).toContain('canary-safe fix path')
    expect(container.textContent).not.toContain('beta delta')
  })

  it('searches bookmarks across sessions', async () => {
    const store = createStore()
    const { container } = await render(
      <BookmarksAppView store={store} i18n={i18n} active />,
    )
    await flush()
    const input = container.querySelector('input')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'beta')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    expect(store.search).toHaveBeenCalledWith('beta')
    expect(container.textContent).toContain('Search across every session')
  })

  it('runs AI organization on the visible bookmarks', async () => {
    const aiTidy = vi.fn(async () => 'Theme: rollout safety')
    const { container } = await render(
      <BookmarksAppView store={createStore()} i18n={i18n} active aiTidy={aiTidy} />,
    )
    await flush()
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('AI organize'))!
        .click()
    })
    await flush()
    expect(aiTidy).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'bm-2' }),
      expect.objectContaining({ id: 'bm-1' }),
    ])
    expect(container.textContent).toContain('Theme: rollout safety')
  })
})

describe('BookmarksAppSidebar', () => {
  it('lists projects with counts and applies the project filter', async () => {
    const { container } = await render(
      <BookmarksAppSidebar store={createStore()} i18n={i18n} />,
    )
    await flush()
    expect(container.textContent).toContain('All bookmarks')
    expect(container.textContent).toContain('ai')
    expect(container.textContent).toContain('infra')

    const projectButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('infra'),
    )!
    await act(async () => {
      projectButton.click()
    })
    expect(explorerState.get().projectFilter).toBe('/demo/infra')
  })
})
