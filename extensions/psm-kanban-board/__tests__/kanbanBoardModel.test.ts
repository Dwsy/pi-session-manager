import { describe, expect, it } from 'vitest'
import type { SessionInfo, SessionTag, Tag } from '@/types'
import {
  buildKanbanColumns,
  createBulkSelection,
  filterColumnSessions,
  orderTagsByColumnOrder,
  reorderTagColumnIds,
} from '../kanbanBoardModel'

const baseSession = (id: string, modified = '2026-04-15T12:00:00.000Z'): SessionInfo => ({
  id,
  path: `/tmp/${id}.jsonl`,
  cwd: '/tmp/project',
  created: modified,
  modified,
  message_count: 1,
  first_message: id,
  last_message: id,
  last_message_role: 'assistant',
})

const tag = (id: string, sortOrder: number): Tag => ({
  id,
  name: id,
  color: 'info',
  sortOrder,
  isBuiltin: false,
  createdAt: '2026-04-15T12:00:00.000Z',
})

describe('kanban board model', () => {
  it('orders tagged sessions by stored kanban position before modified time', () => {
    const sessions = [
      baseSession('older', '2026-04-15T10:00:00.000Z'),
      baseSession('newer', '2026-04-15T12:00:00.000Z'),
    ]
    const sessionTags: SessionTag[] = [
      { sessionId: 'older', tagId: 'todo', position: 0, assignedAt: 'now' },
      { sessionId: 'newer', tagId: 'todo', position: 1, assignedAt: 'now' },
    ]

    const columns = buildKanbanColumns({
      sessions,
      tags: [tag('todo', 0)],
      sessionTags,
    })

    expect(columns.find((column) => column.id === 'todo')?.sessions.map((session) => session.id)).toEqual([
      'older',
      'newer',
    ])
  })

  it('reorders tag columns while keeping the unlabeled column fixed', () => {
    expect(reorderTagColumnIds(['todo', 'doing', 'done'], 'todo', 'done')).toEqual([
      'doing',
      'done',
      'todo',
    ])
    expect(reorderTagColumnIds(['todo', 'doing'], '__untagged__', 'doing')).toEqual(['todo', 'doing'])
    expect(reorderTagColumnIds(['todo', 'doing'], 'todo', '__untagged__')).toEqual(['todo', 'doing'])
  })

  it('applies workspace column order before tag sort order', () => {
    expect(orderTagsByColumnOrder([tag('todo', 0), tag('doing', 1), tag('done', 2)], ['done', 'todo']).map((item) => item.id)).toEqual([
      'done',
      'todo',
      'doing',
    ])
  })

  it('filters sessions inside one column without changing another column', () => {
    const sessions = [
      { ...baseSession('alpha'), name: 'Fix auth panel', last_message: 'token refresh', cwd: '/repo/backend' },
      { ...baseSession('beta'), name: 'Polish board', last_message: 'density toggle', cwd: '/repo/frontend' },
      { ...baseSession('gamma'), name: 'Ship docs', last_message: 'release notes', cwd: '/repo/docs' },
    ]
    const columns = buildKanbanColumns({
      sessions,
      tags: [tag('todo', 0), tag('done', 1)],
      sessionTags: [
        { sessionId: 'alpha', tagId: 'todo', position: 0, assignedAt: 'now' },
        { sessionId: 'beta', tagId: 'todo', position: 1, assignedAt: 'now' },
        { sessionId: 'gamma', tagId: 'done', position: 0, assignedAt: 'now' },
      ],
    })
    const todoColumn = columns.find((column) => column.id === 'todo')!
    const doneColumn = columns.find((column) => column.id === 'done')!

    expect(filterColumnSessions(todoColumn.sessions, 'token').map((item) => item.id)).toEqual(['alpha'])
    expect(doneColumn.sessions.map((item) => item.id)).toEqual(['gamma'])
    expect(filterColumnSessions(todoColumn.sessions, '').map((item) => item.id)).toEqual(['alpha', 'beta'])
  })

  it('tracks bulk selection with stable toggles and clear', () => {
    const selection = createBulkSelection()
      .toggle('a')
      .toggle('b')
      .toggle('a')
      .toggle('c')
      .clear()
      .toggle('b')

    expect(selection.ids).toEqual(['b'])
    expect(selection.has('b')).toBe(true)
    expect(selection.has('a')).toBe(false)
  })
})
