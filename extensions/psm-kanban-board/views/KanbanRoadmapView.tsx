import { CheckSquare, Clock3, MessageSquare, Square } from 'lucide-react'
import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'

import TagBadge from '@/components/tags/TagBadge'
import type { SessionInfo, Tag } from '@/types'
import KanbanLabelBadge from '../labels/KanbanLabelBadge'
import type { KanbanLabel } from '../labels/kanbanLabelsStore'
import { getPathBasename } from '@/utils/path'

import {
  buildKanbanRoadmapDomain,
  buildKanbanRoadmapTicks,
  getKanbanRoadmapPosition,
} from './kanbanRoadmapModel'

const VIRTUALIZATION_THRESHOLD = 50
const ESTIMATED_ROADMAP_ROW_HEIGHT = 48

interface KanbanRoadmapViewProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  selectedSessionIds: Set<string>
  selectionMode: boolean
  getStatusForSession: (sessionId: string) => Tag | null
  getLabelsForSession: (sessionId: string) => KanbanLabel[]
  onToggleBulkSelect: (sessionId: string) => void
  onOpenSession: (session: SessionInfo) => void
  hideProjectInfo?: boolean
  liveSessionIds?: Set<string>
}

function sessionTitle(session: SessionInfo) {
  return session.name || session.first_message || 'Untitled'
}

function tickLabel(value: number) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function timestampLabel(value: number) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function durationLabel(startMs: number, endMs: number) {
  const minutes = Math.max(1, Math.round((endMs - startMs) / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.max(1, Math.round(hours / 24))}d`
}

export default function KanbanRoadmapView({
  sessions,
  selectedSession,
  selectedSessionIds,
  selectionMode,
  getStatusForSession,
  getLabelsForSession,
  onToggleBulkSelect,
  onOpenSession,
  hideProjectInfo = false,
  liveSessionIds,
}: KanbanRoadmapViewProps) {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const domain = useMemo(() => buildKanbanRoadmapDomain(sessions), [sessions])
  const ticks = useMemo(() => buildKanbanRoadmapTicks(domain, 7), [domain])
  const sortedSessions = useMemo(
    () => sessions
      .map((session) => ({ session, modifiedMs: Date.parse(session.modified) }))
      .sort((left, right) => right.modifiedMs - left.modifiedMs)
      .map(({ session }) => session),
    [sessions],
  )
  const useVirtual = sortedSessions.length > VIRTUALIZATION_THRESHOLD
  const virtualizer = useVirtualizer({
    count: sortedSessions.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROADMAP_ROW_HEIGHT,
    getItemKey: (index) => sortedSessions[index]?.id ?? index,
    overscan: 6,
    enabled: useVirtual,
    measureElement: (element) =>
      Math.ceil((element as HTMLElement).getBoundingClientRect().height) || ESTIMATED_ROADMAP_ROW_HEIGHT,
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

  if (sortedSessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-xs text-muted-foreground" role="status" data-testid="kanban-roadmap-view">
        {t('plugins.kanbanBoard.roadmap.empty', 'No sessions match this view.')}
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto p-3" data-testid="kanban-roadmap-view">
      <div className="min-w-[980px] overflow-hidden rounded-md border border-border/35 bg-card/25">
        <div className="sticky top-0 z-20 grid grid-cols-[300px_minmax(680px,1fr)] border-b border-border/35 bg-background/95 backdrop-blur-sm">
          <div className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('plugins.kanbanBoard.roadmap.session', 'Session activity')}
          </div>
          <div className="relative h-9 border-l border-border/30">
            {ticks.map((tick, index) => {
              const left = (index / Math.max(1, ticks.length - 1)) * 100
              return (
                <div key={tick} className="absolute inset-y-0" style={{ left: `${left}%` }}>
                  <div className="h-full border-l border-border/25" />
                  <span className={`absolute top-2 whitespace-nowrap text-[9px] text-muted-foreground ${index === ticks.length - 1 ? '-translate-x-full pr-1' : 'pl-1'}`}>
                    {tickLabel(tick)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {useVirtual && topPadding > 0 ? <div aria-hidden="true" style={{ height: topPadding }} /> : null}
        {renderedRows.map(({ session, virtualRow }) => {
          const position = getKanbanRoadmapPosition(session, domain)
          const status = getStatusForSession(session.id)
          const labels = getLabelsForSession(session.id)
          const bulkSelected = selectedSessionIds.has(session.id)
          const active = selectedSession?.id === session.id
          const live = liveSessionIds?.has(session.id) || session.isLive
          return (
            <div
              key={session.id}
              ref={virtualRow ? virtualizer.measureElement : undefined}
              data-index={virtualRow?.index}
              className={`grid min-h-12 grid-cols-[300px_minmax(680px,1fr)] border-b border-border/20 last:border-b-0 ${active || bulkSelected ? 'bg-primary/5' : 'hover:bg-secondary/20'}`}
              data-testid="kanban-roadmap-row"
              data-session-id={session.id}
            >
              <div className="flex min-w-0 items-center gap-2 px-2.5 py-2">
                <button
                  type="button"
                  className={`flex h-6 w-6 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-ring ${bulkSelected ? 'text-primary' : ''}`}
                  aria-label={bulkSelected ? 'Deselect session' : 'Select session'}
                  onClick={() => onToggleBulkSelect(session.id)}
                >
                  {bulkSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left focus-ring"
                  onClick={() => {
                    if (selectionMode) onToggleBulkSelect(session.id)
                    else onOpenSession(session)
                  }}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 flex-none rounded-full ${live ? 'bg-success' : 'bg-muted-foreground/25'}`} aria-hidden="true" />
                    <span className="truncate text-[11px] font-medium text-foreground">{sessionTitle(session)}</span>
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[9px] text-muted-foreground/65">
                    {!hideProjectInfo && session.cwd ? <span className="truncate font-mono">{getPathBasename(session.cwd)}</span> : null}
                    <span className="inline-flex flex-none items-center gap-0.5"><MessageSquare className="h-2.5 w-2.5" />{session.message_count}</span>
                    {status ? <TagBadge tag={status} compact /> : null}
                    {labels.slice(0, 1).map((label) => <KanbanLabelBadge key={label.id} label={label} compact />)}
                  </div>
                </button>
              </div>

              <div className="relative border-l border-border/30 py-2">
                {ticks.map((tick, index) => (
                  <div
                    key={tick}
                    className="pointer-events-none absolute inset-y-0 border-l border-border/15"
                    style={{ left: `${(index / Math.max(1, ticks.length - 1)) * 100}%` }}
                  />
                ))}
                <button
                  type="button"
                  className={`absolute top-2 flex h-7 min-w-[18px] items-center overflow-hidden rounded-md border px-2 text-left text-[9px] shadow-sm focus-ring ${active || bulkSelected ? 'border-primary/45 bg-primary/20 text-foreground' : 'border-accent/30 bg-accent/15 text-foreground hover:bg-accent/25'}`}
                  style={{ left: `${position.leftPercent}%`, width: `${position.widthPercent}%` }}
                  title={`${timestampLabel(position.startMs)} → ${timestampLabel(position.endMs)}`}
                  aria-label={`${sessionTitle(session)}: ${timestampLabel(position.startMs)} to ${timestampLabel(position.endMs)}`}
                  onClick={() => {
                    if (selectionMode) onToggleBulkSelect(session.id)
                    else onOpenSession(session)
                  }}
                >
                  <Clock3 className="mr-1 h-2.5 w-2.5 flex-none" />
                  <span className="truncate">{durationLabel(position.startMs, position.endMs)}</span>
                </button>
              </div>
            </div>
          )
        })}
        {useVirtual && bottomPadding > 0 ? <div aria-hidden="true" style={{ height: bottomPadding }} /> : null}
      </div>
    </div>
  )
}
