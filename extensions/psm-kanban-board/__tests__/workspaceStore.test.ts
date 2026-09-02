// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { createKanbanWorkspaceStore } from '../workspace/workspaceStore'

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

describe('kanban workspace store status config', () => {
  it('migrates legacy tag filter and column order fields to status naming', async () => {
    const { ctx } = createCtx({
      version: 1,
      activeWorkspaceId: '__default__',
      defaultWorkspaceConfig: {
        projectFilter: null,
        filterTagIds: ['todo'],
        sourceFilterSlugs: [],
        columnOrder: ['todo', 'done'],
        cardDensity: 'compact',
      },
      workspaces: [],
    })
    const store = createKanbanWorkspaceStore(ctx)
    store.load()
    await vi.waitFor(() => expect(store.getSnapshot().loading).toBe(false))

    expect(store.getSnapshot().activeWorkspace.config.filterStatusIds).toEqual(['todo'])
    expect(store.getSnapshot().activeWorkspace.config.statusOrder).toEqual(['todo', 'done'])
    expect(store.getSnapshot().activeWorkspace.config.cardDensity).toBe('compact')
  })

  it('persists per-workspace status order and card density as version 2', async () => {
    const { ctx, getStored } = createCtx(null)
    const store = createKanbanWorkspaceStore(ctx)
    store.load()
    await vi.waitFor(() => expect(store.getSnapshot().loading).toBe(false))

    await store.updateActiveWorkspaceConfig({ statusOrder: ['done', 'todo'], cardDensity: 'comfortable' })

    expect(store.getSnapshot().activeWorkspace.config.statusOrder).toEqual(['done', 'todo'])
    expect(getStored()).toMatchObject({
      version: 2,
      defaultWorkspaceConfig: { statusOrder: ['done', 'todo'], cardDensity: 'comfortable' },
    })
  })

  it('keeps different status orders for different saved workspaces', async () => {
    const { ctx, getStored } = createCtx(null)
    const store = createKanbanWorkspaceStore(ctx)
    store.load()
    await vi.waitFor(() => expect(store.getSnapshot().loading).toBe(false))

    await store.saveWorkspace({
      id: '__new__',
      name: 'Frontend',
      config: {
        projectFilter: null,
        filterStatusIds: [],
        sourceFilterSlugs: [],
        statusOrder: ['todo', 'done'],
        cardDensity: 'comfortable',
        viewMode: 'board',
      },
    })
    const firstId = store.getSnapshot().activeWorkspaceId

    await store.saveWorkspace({
      id: '__new__',
      name: 'Backend',
      config: {
        projectFilter: null,
        filterStatusIds: [],
        sourceFilterSlugs: [],
        statusOrder: ['blocked', 'doing'],
        cardDensity: 'compact',
        viewMode: 'table',
      },
    })
    const secondId = store.getSnapshot().activeWorkspaceId

    store.selectWorkspace(firstId)
    expect(store.getSnapshot().activeWorkspace.config.statusOrder).toEqual(['todo', 'done'])

    store.selectWorkspace(secondId)
    expect(store.getSnapshot().activeWorkspace.config.statusOrder).toEqual(['blocked', 'doing'])
    expect(getStored()).toMatchObject({
      workspaces: expect.arrayContaining([
        expect.objectContaining({ id: firstId, config: expect.objectContaining({ statusOrder: ['todo', 'done'] }) }),
        expect.objectContaining({ id: secondId, config: expect.objectContaining({ statusOrder: ['blocked', 'doing'] }) }),
      ]),
    })
  })
})
