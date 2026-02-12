import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Clock, MessageSquare } from 'lucide-react'
import type { SessionInfo, Tag } from '../../types'
import TagBadge from '../TagBadge'

interface KanbanCardProps {
  session: SessionInfo
  tags: Tag[]
  isSelected: boolean
  isDragging?: boolean
  isOverlay?: boolean
  onSelect: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function KanbanCardInner({
  session,
  tags,
  isSelected,
  isDragging,
  isOverlay,
  onSelect,
  onContextMenu,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: session.id, disabled: isOverlay })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Time formatting
  const diff = Date.now() - new Date(session.modified).getTime()
  const mins = Math.floor(diff / 60000)
  const timeLabel = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`

  // Directory path (last 2 segments)
  const dir = session.cwd?.split('/').filter(Boolean).slice(-2).join('/') || ''

  const cardClasses = [
    'group relative rounded-md border p-2.5 cursor-pointer transition-all',
    'bg-card hover:border-border',
    isSelected ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20' : 'border-border/40',
    isDragging ? 'opacity-50 shadow-lg' : '',
    isOverlay ? 'shadow-xl rotate-2 scale-105 mb-0' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={isOverlay ? undefined : style}
      className={cardClasses}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      {...(isOverlay ? {} : { ...attributes, ...listeners })}
    >
      {/* Header: Title + Tags */}
      <div className="flex items-start gap-1.5 mb-1.5">
        <span className="flex-1 text-[11px] font-medium text-foreground leading-tight line-clamp-2 min-w-0">
          {session.name || session.first_message || 'Untitled'}
        </span>
        {tags.length > 0 && (
          <div className="flex gap-0.5 flex-shrink-0 mt-0.5">
            {tags.slice(0, 2).map(tag => (
              <TagBadge key={tag.id} tag={tag} compact />
            ))}
            {tags.length > 2 && (
              <span className="text-[8px] text-muted-foreground">+{tags.length - 2}</span>
            )}
          </div>
        )}
      </div>

      {/* Last message preview */}
      {session.last_message && (
        <p className="text-[9px] text-muted-foreground truncate mb-1.5">
          {session.last_message}
        </p>
      )}

      {/* Meta info */}
      <div className="flex items-center gap-2 text-[9px] text-muted-foreground/60">
        <span className="inline-flex items-center gap-0.5">
          <MessageSquare size={9} />
          {session.message_count}
        </span>
        <span className="inline-flex items-center gap-0.5">
          <Clock size={9} />
          {timeLabel}
        </span>
        {dir && (
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
    prev.isSelected === next.isSelected &&
    prev.isDragging === next.isDragging &&
    prev.isOverlay === next.isOverlay &&
    prev.tags.length === next.tags.length
  )
})

export default KanbanCard
