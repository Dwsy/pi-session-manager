import { useDraggable } from '@dnd-kit/core'
import { Clock, MessageSquare } from 'lucide-react'
import type { SessionInfo, Tag } from '../../types'
import TagBadge from '../TagBadge'

interface KanbanCardProps {
  session: SessionInfo
  isSelected?: boolean
  isOverlay?: boolean
  onSelect?: () => void
  tags?: Tag[]
  getTagsForSession?: (sessionId: string) => Tag[]
  columnId?: string
}

export default function KanbanCard({ session, isSelected, isOverlay, onSelect, getTagsForSession, columnId }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: session.id,
    data: { columnId },
  })

  const sessionTags = getTagsForSession?.(session.id) || []

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 24) return `${hrs}h`
    return `${Math.floor(diff / 86400000)}d`
  }

  const dir = session.cwd?.split('/').filter(Boolean).slice(-2).join('/') || ''

  return (
    <div
      ref={!isOverlay ? setNodeRef : undefined}
      {...(!isOverlay ? { ...attributes, ...listeners } : {})}
      onClick={onSelect}
      className={`rounded-md border p-2.5 cursor-pointer transition-all ${
        isOverlay ? 'shadow-lg bg-surface border-info/50 rotate-2 scale-105' :
        isDragging ? 'opacity-30' :
        isSelected ? 'bg-blue-500/5 border-blue-500/30' :
        'bg-surface border-border/30 hover:border-border/60'
      }`}
    >
      <div className="flex items-start gap-1.5 mb-1.5">
        <h4 className="text-[11px] font-medium text-foreground leading-tight line-clamp-2 flex-1 min-w-0">
          {session.name || session.first_message || 'Untitled'}
        </h4>
        {sessionTags.length > 0 && (
          <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
            {sessionTags.slice(0, 3).map(tag => (
              <TagBadge key={tag.id} tag={tag} compact />
            ))}
          </div>
        )}
      </div>
      {session.last_message && (
        <p className="text-[9px] text-muted-foreground line-clamp-1 mb-1.5">{session.last_message}</p>
      )}
      <div className="flex items-center gap-2 text-[9px] text-muted-foreground/60">
        <div className="flex items-center gap-0.5">
          <MessageSquare className="h-2.5 w-2.5" />
          <span>{session.message_count}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Clock className="h-2.5 w-2.5" />
          <span>{formatTime(session.modified)}</span>
        </div>
        {dir && <span className="font-mono truncate flex-1 text-right">{dir}</span>}
      </div>
    </div>
  )
}
