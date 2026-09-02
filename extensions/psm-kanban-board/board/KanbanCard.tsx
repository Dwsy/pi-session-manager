import { memo, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CheckSquare, Clock, MessageSquare, Square } from 'lucide-react'
import type { SessionInfo } from '@/types'
import type { KanbanCardDensity } from './kanbanBoardModel'
import KanbanLabelBadge from '../labels/KanbanLabelBadge'
import type { KanbanLabel } from '../labels/kanbanLabelsStore'
import { SessionBadge } from '@/components/session-viewer/SessionBadge'
import { useSettings } from '@/hooks/useSettings'
import { getSessionSourceSlug, getSessionSourceTag } from '@/utils/session'
import { getLastPathSegments } from '@/utils/path'

export function kanbanCardSortableId(columnId: string, sessionId: string) {
  return `card:${columnId}:${sessionId}`
}

interface KanbanCardProps {
  session: SessionInfo
  columnId?: string
  labels: KanbanLabel[]
  isSelected: boolean
  isDragging?: boolean
  isOverlay?: boolean
  onSelect: (rect: DOMRect, clickPoint?: { x: number; y: number }) => void
  onContextMenu?: (e: React.MouseEvent) => void
  hideProjectInfo?: boolean
  isBulkSelected?: boolean
  selectionMode?: boolean
  onToggleBulkSelect?: () => void
  density?: KanbanCardDensity
}

function KanbanCardInner({
  session,
  columnId,
  labels,
  isSelected,
  isDragging,
  isOverlay,
  onSelect,
  onContextMenu,
  hideProjectInfo = false,
  isBulkSelected = false,
  selectionMode = false,
  onToggleBulkSelect,
  density = 'comfortable',
}: KanbanCardProps) {
  const { getSessionSetting } = useSettings()
  const cardRef = useRef<HTMLDivElement>(null)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: sortableIsDragging,
  } = useSortable({
    id: columnId ? kanbanCardSortableId(columnId, session.id) : session.id,
    disabled: isOverlay,
    data: { type: 'card', sessionId: session.id, columnId },
  })

  const dragging = isDragging || sortableIsDragging

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (selectionMode && onToggleBulkSelect) {
      onToggleBulkSelect()
      return
    }

    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect()
      onSelect(rect, { x: event.clientX, y: event.clientY })
    }
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Time formatting
  const diff = Date.now() - new Date(session.modified).getTime()
  const mins = Math.floor(diff / 60000)
  const timeLabel = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`

  // Directory path (last 2 segments)
  const dir = session.cwd ? getLastPathSegments(session.cwd, 2) : ''
  const sourceTag = getSessionSourceTag(session.path)
  const sourceSlug = getSessionSourceSlug(session.path)
  const showAgentIconInBadge =
    getSessionSetting('showAgentIconInSessionBadge') !== false

  const isCompact = density === 'compact'
  const cardClasses = [
    'group relative rounded-md border motion-surface motion-color',
    isCompact ? 'h-16 p-2' : 'h-[100px] p-2.5',
    'bg-card hover:border-border',
    isSelected || isBulkSelected ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'border-border/40',
    dragging ? 'opacity-40 border-primary/40 shadow-lg ring-1 ring-primary/20' : '',
    isOverlay ? 'shadow-xl rotate-2 scale-105 mb-0 cursor-grabbing' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={(node) => {
        // Combine refs for sortable and local access
        if (!isOverlay) {
          setNodeRef(node)
        }
        ;(cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      }}
      style={isOverlay ? undefined : style}
      className={cardClasses}
      onClick={isOverlay ? undefined : handleClick}
      onContextMenu={onContextMenu}
      data-testid="kanban-card"
      data-session-id={session.id}
      data-sortable-id={columnId ? kanbanCardSortableId(columnId, session.id) : session.id}
      data-density={density}
      data-dragging={dragging ? 'true' : undefined}
      {...(isOverlay ? {} : { ...attributes, ...listeners })}
    >
      <button
        type="button"
        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground/55 opacity-0 hover:bg-secondary hover:text-foreground group-hover:opacity-100 focus-ring focus:opacity-100 data-[selected=true]:opacity-100 data-[selected=true]:text-primary"
        aria-label={isBulkSelected ? 'Deselect session' : 'Select session'}
        data-selected={isBulkSelected ? 'true' : 'false'}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onToggleBulkSelect?.()
        }}
      >
        {isBulkSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
      </button>

      {/* Header: Title + Labels */}
      <div className={`flex items-start gap-1.5 pr-5 ${isCompact ? 'mb-1' : 'mb-1.5'}`}>
        <span className={`flex-1 font-medium text-foreground leading-tight min-w-0 ${isCompact ? 'text-[10px] line-clamp-1' : 'text-[11px] line-clamp-2'}`}>
          {session.name || session.first_message || 'Untitled'}
        </span>
        {labels.length > 0 && (
          <div className="flex gap-0.5 flex-shrink-0 mt-0.5">
            {labels.slice(0, 2).map((label) => (
              <KanbanLabelBadge key={label.id} label={label} compact />
            ))}
            {labels.length > 2 && (
              <span className="text-[8px] text-muted-foreground">+{labels.length - 2}</span>
            )}
          </div>
        )}
      </div>

      {/* Last message preview */}
      {!isCompact && session.last_message && (
        <p className="text-[9px] text-muted-foreground truncate mb-1.5">
          {session.last_message}
        </p>
      )}

      {/* Meta info */}
      <div className={`flex items-center text-[9px] text-muted-foreground/60 ${isCompact ? 'gap-1.5' : 'gap-2'}`}>
        {sourceTag && (
          <SessionBadge
            label={sourceTag}
            tone="source"
            sourceSlug={sourceSlug || undefined}
            showIcon={showAgentIconInBadge}
          />
        )}
        <span className="inline-flex items-center gap-0.5">
          <MessageSquare size={9} />
          {session.message_count}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <Clock size={9} />
          {timeLabel}
        </span>
        {dir && !hideProjectInfo && (
          <span className="font-mono truncate flex-1 text-right">{dir}</span>
        )}
      </div>
    </div>
  )
}

// Memo with custom comparison - only re-render when necessary
const KanbanCard = memo(KanbanCardInner, (prev, next) => {
  return (
    prev.session.id === next.session.id &&
    prev.session.modified === next.session.modified &&
    prev.session.name === next.session.name &&
    prev.columnId === next.columnId &&
    prev.isSelected === next.isSelected &&
    prev.isDragging === next.isDragging &&
    prev.isOverlay === next.isOverlay &&
    prev.isBulkSelected === next.isBulkSelected &&
    prev.selectionMode === next.selectionMode &&
    prev.density === next.density &&
    prev.labels.length === next.labels.length &&
    prev.labels.every((label, index) => (
      label.id === next.labels[index]?.id && label.updatedAt === next.labels[index]?.updatedAt
    ))
  )
})

export default KanbanCard
