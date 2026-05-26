import type { SessionInfo, SessionTag, Tag } from '@/types'

export const UNTAGGED_COLUMN_ID = '__untagged__'
export const DESKTOP_KANBAN_COLUMN_WIDTH = 240

export type KanbanCardDensity = 'comfortable' | 'compact'

export interface KanbanColumnData {
  id: string
  tag: Tag | null
  sessions: SessionInfo[]
}

interface BuildKanbanColumnsInput {
  sessions: SessionInfo[]
  tags: Tag[]
  sessionTags: SessionTag[]
  columnOrder?: string[]
}

function modifiedTime(session: SessionInfo): number {
  return new Date(session.modified).getTime()
}

function compareSessionTags(
  left: SessionTag,
  right: SessionTag,
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

export function orderTagsByColumnOrder(tags: Tag[], columnOrder: string[] = []): Tag[] {
  if (columnOrder.length === 0) return tags

  const tagMap = new Map(tags.map((tag) => [tag.id, tag]))
  const ordered = columnOrder
    .map((id) => tagMap.get(id))
    .filter((tag): tag is Tag => tag !== undefined)
  const orderedIds = new Set(ordered.map((tag) => tag.id))
  const remaining = tags.filter((tag) => !orderedIds.has(tag.id))
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

export function visibleCardTagsForColumn(tags: Tag[], columnTag: Tag | null): Tag[] {
  if (!columnTag) return tags
  return tags.filter((tag) => tag.id !== columnTag.id)
}

export function buildKanbanColumns({
  sessions,
  tags,
  sessionTags,
  columnOrder = [],
}: BuildKanbanColumnsInput): KanbanColumnData[] {
  const sessionMap = new Map(sessions.map((session) => [session.id, session]))
  const taggedSessionIds = new Set<string>()
  const columns: KanbanColumnData[] = []
  const orderedTags = orderTagsByColumnOrder(tags, columnOrder)

  for (const tag of orderedTags) {
    for (const sessionTag of sessionTags) {
      if (sessionTag.tagId === tag.id && sessionMap.has(sessionTag.sessionId)) {
        taggedSessionIds.add(sessionTag.sessionId)
      }
    }
  }

  columns.push({
    id: UNTAGGED_COLUMN_ID,
    tag: null,
    sessions: sessions
      .filter((session) => !taggedSessionIds.has(session.id))
      .sort((left, right) => modifiedTime(right) - modifiedTime(left)),
  })

  for (const tag of orderedTags) {
    const tagSessions = sessionTags
      .filter((sessionTag) => sessionTag.tagId === tag.id)
      .sort((left, right) => compareSessionTags(left, right, sessionMap))
      .map((sessionTag) => sessionMap.get(sessionTag.sessionId))
      .filter((session): session is SessionInfo => session !== undefined)

    columns.push({ id: tag.id, tag, sessions: tagSessions })
  }

  return columns
}

export function reorderTagColumnIds(
  tagIds: string[],
  activeId: string,
  overId: string,
): string[] {
  if (activeId === overId) return tagIds
  if (activeId === UNTAGGED_COLUMN_ID || overId === UNTAGGED_COLUMN_ID) return tagIds

  const fromIndex = tagIds.indexOf(activeId)
  const toIndex = tagIds.indexOf(overId)
  if (fromIndex < 0 || toIndex < 0) return tagIds

  const next = [...tagIds]
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
