import { useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, CheckSquare, Clock, MessageSquare, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'

import TagBadge from '@/components/tags/TagBadge'
import type { SessionInfo, Tag } from '@/types'
import { getPathBasename } from '@/utils/path'
import { getSessionSourceTag } from '@/utils/session'

type TableSortKey = 'title' | 'project' | 'updated'
type TableSortDirection = 'asc' | 'desc'

const VIRTUALIZATION_THRESHOLD = 50
const ESTIMATED_TABLE_ROW_HEIGHT = 44

interface KanbanTableViewProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  selectedSessionIds: Set<string>
  selectionMode: boolean
  getTagsForSession: (sessionId: string) => Tag[]
  onToggleBulkSelect: (sessionId: string) => void
  onOpenSession: (session: SessionInfo) => void
  hideProjectInfo?: boolean
  liveSessionIds?: Set<string>
}

function sessionTitle(session: SessionInfo) {
  return session.name || session.first_message || 'Untitled'
}

function projectName(session: SessionInfo) {
  return session.cwd ? getPathBasename(session.cwd) : '—'
}

function relativeTime(value: string) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime())
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export default function KanbanTableView({
  sessions,
  selectedSession,
  selectedSessionIds,
  selectionMode,
  getTagsForSession,
  onToggleBulkSelect,
  onOpenSession,
  hideProjectInfo = false,
  liveSessionIds,
}: KanbanTableViewProps) {
  const { t } = useTranslation()
  const [sortKey, setSortKey] = useState<TableSortKey>('updated')
  const [sortDirection, setSortDirection] = useState<TableSortDirection>('desc')
  const scrollRef = useRef<HTMLDivElement>(null)

  const sortedSessions = useMemo(() => {
    if (sortKey === 'updated') {
      const next = sessions.map((session) => ({
        session,
        modifiedMs: Date.parse(session.modified),
      }))
      next.sort((left, right) => {
        const comparison = left.modifiedMs - right.modifiedMs
        return sortDirection === 'asc' ? comparison : -comparison
      })
      return next.map(({ session }) => session)
    }

    const next = [...sessions]
    next.sort((left, right) => {
      let comparison = 0
      if (sortKey === 'title') {
        comparison = sessionTitle(left).localeCompare(sessionTitle(right))
      } else {
        comparison = projectName(left).localeCompare(projectName(right))
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
    return next
  }, [sessions, sortDirection, sortKey])

  const useVirtual = sortedSessions.length > VIRTUALIZATION_THRESHOLD
  const virtualizer = useVirtualizer({
    count: sortedSessions.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_TABLE_ROW_HEIGHT,
    getItemKey: (index) => sortedSessions[index]?.id ?? index,
    overscan: 6,
    enabled: useVirtual,
    measureElement: (element) =>
      Math.ceil((element as HTMLElement).getBoundingClientRect().height) || ESTIMATED_TABLE_ROW_HEIGHT,
  })
  const virtualRows = useVirtual ? virtualizer.getVirtualItems() : []
  const firstVirtualRow = virtualRows[0]
  const lastVirtualRow = virtualRows[virtualRows.length - 1]
  const topPadding = firstVirtualRow?.start ?? 0
  const bottomPadding = lastVirtualRow
    ? Math.max(0, virtualizer.getTotalSize() - lastVirtualRow.end)
    : 0
  const renderedRows = useVirtual
    ? virtualRows.map((virtualRow) => ({
        session: sortedSessions[virtualRow.index],
        virtualRow,
      }))
    : sortedSessions.map((session) => ({ session, virtualRow: null }))
  const columnCount = hideProjectInfo ? 6 : 7

  const toggleSort = (nextKey: TableSortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'updated' ? 'desc' : 'asc')
  }

  const sortIcon = (key: TableSortKey) => {
    if (sortKey !== key) return null
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3" aria-hidden="true" />
      : <ArrowDown className="h-3 w-3" aria-hidden="true" />
  }

  if (sortedSessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-xs text-muted-foreground" role="status" data-testid="kanban-table-view">
        {t('plugins.kanbanBoard.table.empty', 'No sessions match this view.')}
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto p-3" data-testid="kanban-table-view">
      <div className="min-w-[860px] overflow-hidden rounded-md border border-border/35 bg-card/30">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="sticky top-0 z-10 bg-background/95 text-[10px] uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
            <tr className="border-b border-border/35">
              <th className="w-10 px-2 py-2" aria-label={t('plugins.kanbanBoard.table.selection', 'Selection')} />
              <th className="min-w-[300px] px-3 py-2" aria-sort={sortKey === 'title' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className="inline-flex items-center gap-1 hover:text-foreground focus-ring" onClick={() => toggleSort('title')}>
                  {t('plugins.kanbanBoard.table.session', 'Session')}
                  {sortIcon('title')}
                </button>
              </th>
              <th className="w-[210px] px-3 py-2">{t('plugins.kanbanBoard.table.status', 'Status')}</th>
              {!hideProjectInfo ? (
                <th className="w-[180px] px-3 py-2" aria-sort={sortKey === 'project' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground focus-ring" onClick={() => toggleSort('project')}>
                    {t('plugins.kanbanBoard.table.project', 'Project')}
                    {sortIcon('project')}
                  </button>
                </th>
              ) : null}
              <th className="w-[140px] px-3 py-2">{t('plugins.kanbanBoard.table.source', 'Source / model')}</th>
              <th className="w-[90px] px-3 py-2 text-right">{t('plugins.kanbanBoard.table.messages', 'Messages')}</th>
              <th className="w-[100px] px-3 py-2 text-right" aria-sort={sortKey === 'updated' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className="ml-auto inline-flex items-center gap-1 hover:text-foreground focus-ring" onClick={() => toggleSort('updated')}>
                  {t('plugins.kanbanBoard.table.updated', 'Updated')}
                  {sortIcon('updated')}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {useVirtual && topPadding > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={columnCount} style={{ height: topPadding, padding: 0, border: 0 }} />
              </tr>
            ) : null}
            {renderedRows.map(({ session, virtualRow }) => {
              const tags = getTagsForSession(session.id)
              const bulkSelected = selectedSessionIds.has(session.id)
              const active = selectedSession?.id === session.id
              const source = getSessionSourceTag(session.path)
              const live = liveSessionIds?.has(session.id) || session.isLive
              return (
                <tr
                  key={session.id}
                  ref={virtualRow ? virtualizer.measureElement : undefined}
                  data-index={virtualRow?.index}
                  className={`group cursor-pointer border-b border-border/20 last:border-b-0 hover:bg-secondary/35 ${active || bulkSelected ? 'bg-primary/5' : ''}`}
                  data-testid="kanban-table-row"
                  data-session-id={session.id}
                  tabIndex={0}
                  onClick={() => {
                    if (selectionMode) onToggleBulkSelect(session.id)
                    else onOpenSession(session)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    if (selectionMode) onToggleBulkSelect(session.id)
                    else onOpenSession(session)
                  }}
                >
                  <td className="px-2 py-2 align-middle">
                    <button
                      type="button"
                      className={`flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-ring ${bulkSelected ? 'text-primary' : ''}`}
                      aria-label={bulkSelected ? 'Deselect session' : 'Select session'}
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleBulkSelect(session.id)
                      }}
                    >
                      {bulkSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-1.5 w-1.5 flex-none rounded-full ${live ? 'bg-success' : 'bg-muted-foreground/25'}`} aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{sessionTitle(session)}</div>
                        {session.last_message ? <div className="mt-0.5 truncate text-[9px] text-muted-foreground/65">{session.last_message}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    {tags.length > 0 ? (
                      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                        {tags.slice(0, 3).map((tag) => <TagBadge key={tag.id} tag={tag} compact />)}
                        {tags.length > 3 ? <span className="text-[9px] text-muted-foreground">+{tags.length - 3}</span> : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/55">{t('plugins.kanbanBoard.untagged', 'Unlabeled')}</span>
                    )}
                  </td>
                  {!hideProjectInfo ? (
                    <td className="px-3 py-2 align-middle font-mono text-[10px] text-muted-foreground">{projectName(session)}</td>
                  ) : null}
                  <td className="px-3 py-2 align-middle text-[10px] text-muted-foreground">
                    <div className="truncate">{source || '—'}</div>
                    {session.model ? <div className="mt-0.5 truncate text-[9px] text-muted-foreground/55">{session.model}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-right align-middle tabular-nums text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{session.message_count}</span>
                  </td>
                  <td className="px-3 py-2 text-right align-middle tabular-nums text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{relativeTime(session.modified)}</span>
                  </td>
                </tr>
              )
            })}
            {useVirtual && bottomPadding > 0 ? (
              <tr aria-hidden="true">
                <td colSpan={columnCount} style={{ height: bottomPadding, padding: 0, border: 0 }} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
