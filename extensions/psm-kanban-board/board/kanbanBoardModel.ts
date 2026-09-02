import type { SessionInfo, SessionTag, Tag } from '@/types'

export const NO_STATUS_COLUMN_ID = '__no_status__'
export const DESKTOP_KANBAN_COLUMN_WIDTH = 240

export type KanbanStatus = Tag
export type KanbanStatusAssignment = SessionTag
export type KanbanCardDensity = 'comfortable' | 'compact'
export type KanbanViewMode = 'board' | 'table' | 'roadmap'

export interface KanbanColumnData {
  id: string
  status: KanbanStatus | null
  sessions: SessionInfo[]
}

interface BuildKanbanColumnsInput {
  sessions: SessionInfo[]
  statuses: KanbanStatus[]
  statusAssignments: KanbanStatusAssignment[]
  statusOrder?: string[]
}

function modifiedTime(session: SessionInfo): number {
  return new Date(session.modified).getTime()
}

function assignmentTime(assignment: KanbanStatusAssignment): number {
  const parsed = Date.parse(assignment.assignedAt)
  return Number.isFinite(parsed) ? parsed : 0
}

function compareStatusAssignments(
  left: KanbanStatusAssignment,
  right: KanbanStatusAssignment,
  sessionMap: Map<string, SessionInfo>,
): number {
  if (left.position !== right.position) {
    return left.position - right.position
  }

  const leftSession = sessionMap.get(left.sessionId)
  const rightSession = sessionMap.get(right.sessionId)
  if (!leftSession || !rightSession) return 0
  return modifiedTime(rightSession) - modifiedTime(leftSession)
}

/**
 * Legacy Kanban data could attach multiple tags to a session. Status is now a
 * single-value field, so the newest valid assignment wins deterministically.
 * When timestamps tie, the later row wins to preserve append-order intent.
 */
export function resolveSessionStatusAssignments(
  statuses: KanbanStatus[],
  assignments: KanbanStatusAssignment[],
): Map<string, KanbanStatusAssignment> {
  const statusIds = new Set(statuses.map((status) => status.id))
  const resolved = new Map<string, { assignment: KanbanStatusAssignment; index: number }>()

  assignments.forEach((assignment, index) => {
    if (!statusIds.has(assignment.tagId)) return
    const current = resolved.get(assignment.sessionId)
    if (!current) {
      resolved.set(assignment.sessionId, { assignment, index })
      return
    }

    const currentTime = assignmentTime(current.assignment)
    const nextTime = assignmentTime(assignment)
    if (nextTime > currentTime || (nextTime === currentTime && index > current.index)) {
      resolved.set(assignment.sessionId, { assignment, index })
    }
  })

  return new Map(
    Array.from(resolved.entries()).map(([sessionId, value]) => [sessionId, value.assignment]),
  )
}

export function getSessionStatusId(
  statuses: KanbanStatus[],
  assignments: KanbanStatusAssignment[],
  sessionId: string,
): string | null {
  return resolveSessionStatusAssignments(statuses, assignments).get(sessionId)?.tagId ?? null
}

export function orderStatusesByStatusOrder(
  statuses: KanbanStatus[],
  statusOrder: string[] = [],
): KanbanStatus[] {
  if (statusOrder.length === 0) return statuses

  const statusMap = new Map(statuses.map((status) => [status.id, status]))
  const ordered = statusOrder
    .map((id) => statusMap.get(id))
    .filter((status): status is KanbanStatus => status !== undefined)
  const orderedIds = new Set(ordered.map((status) => status.id))
  const remaining = statuses.filter((status) => !orderedIds.has(status.id))
  return [...ordered, ...remaining]
}

export function filterColumnSessions(sessions: SessionInfo[], query: string): SessionInfo[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return sessions

  return sessions.filter((session) => {
    const haystack = [
      session.name,
      session.first_message,
      session.last_message,
      session.cwd,
      session.model,
    ]
      .filter(Boolean)
      .join('\n')
      .toLowerCase()
    return haystack.includes(normalized)
  })
}

export function buildKanbanColumns({
  sessions,
  statuses,
  statusAssignments,
  statusOrder = [],
}: BuildKanbanColumnsInput): KanbanColumnData[] {
  const sessionMap = new Map(sessions.map((session) => [session.id, session]))
  const resolvedAssignments = resolveSessionStatusAssignments(statuses, statusAssignments)
  const orderedStatuses = orderStatusesByStatusOrder(statuses, statusOrder)
  const columns: KanbanColumnData[] = []

  columns.push({
    id: NO_STATUS_COLUMN_ID,
    status: null,
    sessions: sessions
      .filter((session) => !resolvedAssignments.has(session.id))
      .sort((left, right) => modifiedTime(right) - modifiedTime(left)),
  })

  for (const status of orderedStatuses) {
    const statusSessions = Array.from(resolvedAssignments.values())
      .filter((assignment) => assignment.tagId === status.id)
      .sort((left, right) => compareStatusAssignments(left, right, sessionMap))
      .map((assignment) => sessionMap.get(assignment.sessionId))
      .filter((session): session is SessionInfo => session !== undefined)

    columns.push({ id: status.id, status, sessions: statusSessions })
  }

  return columns
}

export function reorderStatusColumnIds(
  statusIds: string[],
  activeId: string,
  overId: string,
): string[] {
  if (activeId === overId) return statusIds
  if (activeId === NO_STATUS_COLUMN_ID || overId === NO_STATUS_COLUMN_ID) return statusIds

  const fromIndex = statusIds.indexOf(activeId)
  const toIndex = statusIds.indexOf(overId)
  if (fromIndex < 0 || toIndex < 0) return statusIds

  const next = [...statusIds]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export interface BulkSelectionState {
  ids: string[]
  has(id: string): boolean
  toggle(id: string): BulkSelectionState
  clear(): BulkSelectionState
}

function bulkSelectionFrom(ids: string[]): BulkSelectionState {
  const uniqueIds = Array.from(new Set(ids))
  return {
    ids: uniqueIds,
    has: (id) => uniqueIds.includes(id),
    toggle: (id) => (
      uniqueIds.includes(id)
        ? bulkSelectionFrom(uniqueIds.filter((item) => item !== id))
        : bulkSelectionFrom([...uniqueIds, id])
    ),
    clear: () => bulkSelectionFrom([]),
  }
}

export function createBulkSelection(ids: string[] = []): BulkSelectionState {
  return bulkSelectionFrom(ids)
}
