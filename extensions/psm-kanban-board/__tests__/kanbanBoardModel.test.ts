import { describe, expect, it } from 'vitest'
import type { SessionInfo, SessionTag, Tag } from '@/types'
import {
  buildKanbanColumns,
  createBulkSelection,
  filterColumnSessions,
  getSessionStatusId,
  NO_STATUS_COLUMN_ID,
  orderStatusesByStatusOrder,
  reorderStatusColumnIds,
} from '../board/kanbanBoardModel'

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

const status = (id: string, sortOrder: number): Tag => ({
  id,
  name: id,
  color: 'info',
  sortOrder,
  isBuiltin: false,
  createdAt: '2026-04-15T12:00:00.000Z',
})

describe('kanban board status model', () => {
  it('resolves legacy multi-tag sessions to the newest single status', () => {
    const statuses = [status('todo', 0), status('doing', 1)]
    const assignments: SessionTag[] = [
      { sessionId: 'a', tagId: 'todo', position: 0, assignedAt: '2026-04-15T10:00:00.000Z' },
      { sessionId: 'a', tagId: 'doing', position: 0, assignedAt: '2026-04-15T11:00:00.000Z' },
    ]

    expect(getSessionStatusId(statuses, assignments, 'a')).toBe('doing')
    const columns = buildKanbanColumns({ sessions: [baseSession('a')], statuses, statusAssignments: assignments })
    expect(columns.find((column) => column.id === 'todo')?.sessions).toEqual([])
    expect(columns.find((column) => column.id === 'doing')?.sessions.map((session) => session.id)).toEqual(['a'])
  })

  it('uses later append order when legacy status timestamps tie', () => {
    const statuses = [status('todo', 0), status('done', 1)]
    const assignments: SessionTag[] = [
      { sessionId: 'a', tagId: 'todo', position: 0, assignedAt: 'now' },
      { sessionId: 'a', tagId: 'done', position: 0, assignedAt: 'now' },
    ]
    expect(getSessionStatusId(statuses, assignments, 'a')).toBe('done')
  })

  it('orders sessions inside a status by stored position before modified time', () => {
    const sessions = [
      baseSession('older', '2026-04-15T10:00:00.000Z'),
      baseSession('newer', '2026-04-15T12:00:00.000Z'),
    ]
    const assignments: SessionTag[] = [
      { sessionId: 'older', tagId: 'todo', position: 0, assignedAt: '2026-04-15T12:00:00.000Z' },
      { sessionId: 'newer', tagId: 'todo', position: 1, assignedAt: '2026-04-15T12:00:00.000Z' },
    ]

    const columns = buildKanbanColumns({ sessions, statuses: [status('todo', 0)], statusAssignments: assignments })
    expect(columns.find((column) => column.id === 'todo')?.sessions.map((session) => session.id)).toEqual(['older', 'newer'])
  })

  it('keeps sessions without a status in the no-status column', () => {
    const columns = buildKanbanColumns({
      sessions: [baseSession('a'), baseSession('b')],
      statuses: [status('todo', 0)],
      statusAssignments: [{ sessionId: 'a', tagId: 'todo', position: 0, assignedAt: 'now' }],
    })
    expect(columns.find((column) => column.id === NO_STATUS_COLUMN_ID)?.sessions.map((session) => session.id)).toEqual(['b'])
  })

  it('reorders status columns while keeping the no-status column fixed', () => {
    expect(reorderStatusColumnIds(['todo', 'doing', 'done'], 'todo', 'done')).toEqual(['doing', 'done', 'todo'])
    expect(reorderStatusColumnIds(['todo', 'doing'], NO_STATUS_COLUMN_ID, 'doing')).toEqual(['todo', 'doing'])
    expect(reorderStatusColumnIds(['todo', 'doing'], 'todo', NO_STATUS_COLUMN_ID)).toEqual(['todo', 'doing'])
  })

  it('applies workspace status order before status sort order', () => {
    expect(orderStatusesByStatusOrder([status('todo', 0), status('doing', 1), status('done', 2)], ['done', 'todo']).map((item) => item.id)).toEqual(['done', 'todo', 'doing'])
  })

  it('filters sessions inside one status column without changing another column', () => {
    const sessions = [
      { ...baseSession('alpha'), name: 'Fix auth panel', last_message: 'token refresh', cwd: '/repo/backend' },
      { ...baseSession('beta'), name: 'Polish board', last_message: 'density toggle', cwd: '/repo/frontend' },
      { ...baseSession('gamma'), name: 'Ship docs', last_message: 'release notes', cwd: '/repo/docs' },
    ]
    const columns = buildKanbanColumns({
      sessions,
      statuses: [status('todo', 0), status('done', 1)],
      statusAssignments: [
        { sessionId: 'alpha', tagId: 'todo', position: 0, assignedAt: 'now' },
        { sessionId: 'beta', tagId: 'todo', position: 1, assignedAt: 'now' },
        { sessionId: 'gamma', tagId: 'done', position: 0, assignedAt: 'now' },
      ],
    })
    const todoColumn = columns.find((column) => column.id === 'todo')!
    const doneColumn = columns.find((column) => column.id === 'done')!

    expect(filterColumnSessions(todoColumn.sessions, 'token').map((item) => item.id)).toEqual(['alpha'])
    expect(doneColumn.sessions.map((item) => item.id)).toEqual(['gamma'])
  })

  it('tracks bulk selection with stable toggles and clear', () => {
    const selection = createBulkSelection().toggle('a').toggle('b').toggle('a').toggle('c').clear().toggle('b')
    expect(selection.ids).toEqual(['b'])
    expect(selection.has('b')).toBe(true)
    expect(selection.has('a')).toBe(false)
  })
})
