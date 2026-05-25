// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { createKanbanWorkspaceStore } from '../workspaceStore'

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

describe('kanban workspace store view config', () => {
  it('sanitizes and persists per-workspace column order and card density', async () => {
    const { ctx, getStored } = createCtx({
      version: 1,
      activeWorkspaceId: '__default__',
      defaultWorkspaceConfig: {
        projectFilter: null,
        filterTagIds: [],
        sourceFilterSlugs: [],
        columnOrder: ['todo', 'done'],
        cardDensity: 'compact',
      },
      workspaces: [],
    })
    const store = createKanbanWorkspaceStore(ctx)

    store.load()
    await vi.waitFor(() => {
      expect(store.getSnapshot().loading).toBe(false)
    })

    expect(store.getSnapshot().activeWorkspace.config.columnOrder).toEqual(['todo', 'done'])
    expect(store.getSnapshot().activeWorkspace.config.cardDensity).toBe('compact')

    await store.updateActiveWorkspaceConfig({
      columnOrder: ['done', 'todo'],
      cardDensity: 'comfortable',
    })

    expect(store.getSnapshot().activeWorkspace.config.columnOrder).toEqual(['done', 'todo'])
    expect(store.getSnapshot().activeWorkspace.config.cardDensity).toBe('comfortable')
    expect(getStored()).toMatchObject({
      defaultWorkspaceConfig: {
        columnOrder: ['done', 'todo'],
        cardDensity: 'comfortable',
      },
    })
  })

  it('keeps different column orders for different saved workspaces', async () => {
    const { ctx, getStored } = createCtx(null)
    const store = createKanbanWorkspaceStore(ctx)

    store.load()
    await vi.waitFor(() => {
      expect(store.getSnapshot().loading).toBe(false)
    })

    await store.saveWorkspace({
      id: '__new__',
      name: 'Frontend',
      config: {
        projectFilter: null,
        filterTagIds: [],
        sourceFilterSlugs: [],
        columnOrder: ['todo', 'done'],
        cardDensity: 'comfortable',
      },
    })
    const firstId = store.getSnapshot().activeWorkspaceId

    await store.saveWorkspace({
      id: '__new__',
      name: 'Backend',
      config: {
        projectFilter: null,
        filterTagIds: [],
        sourceFilterSlugs: [],
        columnOrder: ['blocked', 'doing'],
        cardDensity: 'compact',
      },
    })
    const secondId = store.getSnapshot().activeWorkspaceId

    store.selectWorkspace(firstId)
    expect(store.getSnapshot().activeWorkspace.config.columnOrder).toEqual(['todo', 'done'])

    store.selectWorkspace(secondId)
    expect(store.getSnapshot().activeWorkspace.config.columnOrder).toEqual(['blocked', 'doing'])
    expect(getStored()).toMatchObject({
      workspaces: expect.arrayContaining([
        expect.objectContaining({ id: firstId, config: expect.objectContaining({ columnOrder: ['todo', 'done'] }) }),
        expect.objectContaining({ id: secondId, config: expect.objectContaining({ columnOrder: ['blocked', 'doing'] }) }),
      ]),
    })
  })
})
