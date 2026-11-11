// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Bookmark, RegistryEntry } from './bookmark'
import { BookmarksAppView, BookmarksPanel, BookmarkHighlightPopover, type BookmarkStoreLike } from './ui'

const bookmark: Bookmark = {
  id: 'bm-1',
  sessionPath: '/tmp/session.jsonl',
  anchor: {
    entryId: 'm1',
    entryRole: 'assistant',
    textQuote: { exact: 'beta', prefix: 'alpha ', suffix: ' gamma' },
  },
  quote: 'beta delta',
  note: 'keep this',
  createdAt: '2026-11-11T10:00:00.000Z',
  updatedAt: '2026-11-11T10:00:00.000Z',
}

const i18n = {
  language: 'en-US',
  t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    values
      ? fallback.replace(/{{(\w+)}}/g, (_, name: string) => String(values[name] ?? ''))
      : fallback,
}

function createStore(overrides: Partial<BookmarkStoreLike> = {}): BookmarkStoreLike {
  return {
    listForSession: vi.fn(async () => [bookmark]),
    listRecent: vi.fn(async (): Promise<RegistryEntry[]> => [
      {
        id: 'bm-1',
        sessionPath: '/tmp/session.jsonl',
        entryId: 'm1',
        quote: 'beta delta',
        note: 'keep this',
        createdAt: '2026-11-11T10:00:00.000Z',
      },
    ]),
    search: vi.fn(async () => [bookmark]),
    updateNote: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined),
    consumePendingNoteId: vi.fn(() => null),
    ...overrides,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
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

describe('BookmarksPanel', () => {
  it('renders bookmarks with quote and note', async () => {
    const { container } = await render(
      <BookmarksPanel
        store={createStore()}
        i18n={i18n}
        session={{ path: '/tmp/session.jsonl' }}
        onJump={() => undefined}
      />,
    )
    await flush()
    expect(container.textContent).toContain('beta delta')
    expect(container.textContent).toContain('keep this')
  })

  it('shows the empty state when there is nothing saved', async () => {
    const { container } = await render(
      <BookmarksPanel
        store={createStore({ listForSession: vi.fn(async () => []) })}
        i18n={i18n}
        session={{ path: '/tmp/session.jsonl' }}
        onJump={() => undefined}
      />,
    )
    await flush()
    expect(container.textContent).toContain('No bookmarks yet')
    expect(container.textContent).toContain('Select text in the transcript')
  })

  it('jumps to the bookmarked entry', async () => {
    const onJump = vi.fn()
    const { container } = await render(
      <BookmarksPanel
        store={createStore()}
        i18n={i18n}
        session={{ path: '/tmp/session.jsonl' }}
        onJump={onJump}
      />,
    )
    await flush()
    const jump = container.querySelector<HTMLButtonElement>('button[title="Jump to text"]')!
    await act(async () => {
      jump.click()
    })
    expect(onJump).toHaveBeenCalledWith('m1')
  })

  it('saves an edited note', async () => {
    const store = createStore()
    const { container } = await render(
      <BookmarksPanel
        store={store}
        i18n={i18n}
        session={{ path: '/tmp/session.jsonl' }}
        onJump={() => undefined}
      />,
    )
    await flush()
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="Edit note"]')!.click()
    })
    const textarea = container.querySelector('textarea')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'updated note')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Save note')!
        .click()
    })
    expect(store.updateNote).toHaveBeenCalledWith('bm-1', '/tmp/session.jsonl', 'updated note')
  })

  it('requires confirmation before deleting', async () => {
    const store = createStore()
    const { container } = await render(
      <BookmarksPanel
        store={store}
        i18n={i18n}
        session={{ path: '/tmp/session.jsonl' }}
        onJump={() => undefined}
      />,
    )
    await flush()
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="Delete"]')!.click()
    })
    expect(store.remove).not.toHaveBeenCalled()
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="Delete this bookmark?"]')!.click()
    })
    expect(store.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'bm-1' }))
  })
})

describe('BookmarkHighlightPopover', () => {
  it('edits the note inline and keeps data in sync through the store', async () => {
    const store = createStore({
      listForSession: vi.fn(async () => [{ ...bookmark, note: undefined }]),
    })
    const onClose = vi.fn()
    const { container } = await render(
      <BookmarkHighlightPopover
        store={store}
        i18n={i18n}
        bookmarkId="bm-1"
        sessionPath="/tmp/session.jsonl"
        onClose={onClose}
      />,
    )
    await flush()
    // No note yet -> editor opens focused.
    expect(container.querySelector('textarea')).not.toBeNull()

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Save note')!
        .click()
    })
    expect(store.updateNote).toHaveBeenCalledWith('bm-1', '/tmp/session.jsonl', '')
  })

  it('renders nothing once the bookmark is gone', async () => {
    const store = createStore({ listForSession: vi.fn(async () => []) })
    const { container } = await render(
      <BookmarkHighlightPopover
        store={store}
        i18n={i18n}
        bookmarkId="bm-404"
        sessionPath="/tmp/session.jsonl"
        onClose={() => undefined}
      />,
    )
    await flush()
    expect(container.textContent).toBe('')
  })
})

describe('BookmarksAppView', () => {
  it('searches bookmarks and offers session navigation', async () => {
    const store = createStore()
    const onSelectSession = vi.fn()
    const { container } = await render(
      <BookmarksAppView
        store={store}
        i18n={i18n}
        active
        onSelectSession={onSelectSession}
      />,
    )
    await flush()
    expect(store.listRecent).toHaveBeenCalled()
    expect(container.textContent).toContain('Recent bookmarks')
    expect(container.textContent).toContain('beta delta')

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Open session')!
        .click()
    })
    expect(onSelectSession).toHaveBeenCalledWith('/tmp/session.jsonl')

    const input = container.querySelector('input')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'beta')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    expect(store.search).toHaveBeenCalledWith('beta')
  })

  it('runs AI organization on the visible bookmarks', async () => {
    const aiTidy = vi.fn(async () => 'Theme: greek letters')
    const { container } = await render(
      <BookmarksAppView
        store={createStore()}
        i18n={i18n}
        active
        aiTidy={aiTidy}
      />,
    )
    await flush()
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('AI organize'))!
        .click()
    })
    await flush()
    expect(aiTidy).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'bm-1', quote: 'beta delta' }),
    ])
    expect(container.textContent).toContain('Theme: greek letters')
  })
})
