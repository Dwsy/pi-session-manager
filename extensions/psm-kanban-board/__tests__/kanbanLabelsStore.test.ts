// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { createKanbanLabelsStore, labelsForSession } from '../labels/kanbanLabelsStore'

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

describe('kanban labels store', () => {
  it('persists GitHub-style label metadata and assignments independently', async () => {
    const { ctx, getStored } = createCtx()
    const store = createKanbanLabelsStore(ctx)
    store.load()
    await vi.waitFor(() => expect(store.getSnapshot().loading).toBe(false))

    const label = await store.createLabel({
      name: 'performance',
      color: '#1f6feb',
      description: 'Performance and latency work',
    })
    await store.toggleLabel('session-1', label.id, true)

    expect(labelsForSession(store.getSnapshot().labels, store.getSnapshot().assignments, 'session-1')).toEqual([
      expect.objectContaining({ name: 'performance', color: '#1f6feb', description: 'Performance and latency work' }),
    ])
    expect(getStored()).toMatchObject({
      version: 1,
      labels: [expect.objectContaining({ id: label.id, name: 'performance' })],
      assignments: [{ sessionId: 'session-1', labelId: label.id }],
    })
  })

  it('updates and deletes labels with their assignments', async () => {
    const { ctx } = createCtx()
    const store = createKanbanLabelsStore(ctx)
    store.load()
    await vi.waitFor(() => expect(store.getSnapshot().loading).toBe(false))

    const label = await store.createLabel({ name: 'bug', color: '#d1242f', description: '' })
    await store.toggleLabel('session-1', label.id, true)
    await store.updateLabel(label.id, { description: 'Something is broken' })
    expect(store.getSnapshot().labels[0]?.description).toBe('Something is broken')

    await store.deleteLabel(label.id)
    expect(store.getSnapshot().labels).toEqual([])
    expect(store.getSnapshot().assignments).toEqual([])
  })
})
