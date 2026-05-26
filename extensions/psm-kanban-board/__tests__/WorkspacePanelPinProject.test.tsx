// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionInfo, Tag } from '@/types'

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}))

vi.mock('@/components/ui/CompositionInput', () => ({
  default: ({ value, onChange, ...props }: any) => (
    <input
      {...props}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}))

vi.mock('../WorkspaceEditor', () => ({
  default: () => null,
}))

import WorkspacePanel from '../WorkspacePanel'
import { createKanbanWorkspaceStore } from '../workspaceStore'

const archiveTag: Tag = {
  id: 'builtin-archive',
  name: 'Archive',
  color: 'slate',
  sortOrder: 4,
  isBuiltin: true,
  createdAt: '2026-05-26T12:00:00.000Z',
}

function session(id: string, cwd: string): SessionInfo {
  return {
    id,
    path: `/tmp/${id}.jsonl`,
    cwd,
    created: '2026-05-26T12:00:00.000Z',
    modified: '2026-05-26T12:00:00.000Z',
    message_count: 1,
    first_message: id,
    last_message: id,
    last_message_role: 'assistant',
  }
}

function createCtx(initial: unknown = null) {
  let stored = initial
  return {
    ctx: {
      psm: {
        config: {
          read: vi.fn(async () => stored),
          write: vi.fn(async (_key: string, value: unknown) => {
            stored = value
          }),
        },
      },
    } as any,
    getStored: () => stored,
  }
}

function renderPanel() {
  const { ctx, getStored } = createCtx(null)
  const store = createKanbanWorkspaceStore(ctx)
  const onToggleTag = vi.fn()
  render(
    <WorkspacePanel
      workspaceStore={store}
      data={{
        sessions: [session('a', '/work/frontend'), session('b', '/work/backend')],
        tags: [archiveTag],
        sessionTags: [],
        sourceOptions: [],
        getDescendantIds: () => [],
        onToggleTag,
        onClearSelectedSession: vi.fn(),
      }}
    />,
  )
  return { store, getStored, onToggleTag }
}

describe('WorkspacePanel project pin', () => {
  afterEach(() => cleanup())

  it('pins a project to the active workspace from the sidebar row', async () => {
    const { getStored } = renderPanel()

    const pinButton = await screen.findByRole('button', { name: 'Pin project frontend' })
    fireEvent.click(pinButton)

    await waitFor(() => {
      expect(getStored()).toMatchObject({
        defaultWorkspaceConfig: {
          projectFilter: '/work/frontend',
        },
      })
    })
  })

  it('keeps the row click as temporary project selection', async () => {
    const { store, getStored } = renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: 'Select project frontend' }))

    expect(store.getSnapshot().selectedProject).toBe('/work/frontend')
    expect(getStored()).toBeNull()
  })

  it('archives project sessions with the builtin archive tag', async () => {
    const { onToggleTag } = renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: 'Archive project frontend' }))

    expect(onToggleTag).toHaveBeenCalledWith('a', 'builtin-archive', true)
    expect(onToggleTag).toHaveBeenCalledTimes(1)
  })
})
