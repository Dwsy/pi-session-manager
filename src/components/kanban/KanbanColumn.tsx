import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { SessionInfo, Tag } from '../../types'
import KanbanCard from './KanbanCard'
import { getColorClass, getColorStyle } from '../TagBadge'

interface KanbanColumnProps {
  id: string
  tag: Tag | null
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
  getTagsForSession: (sessionId: string) => Tag[]
}

export default function KanbanColumn({
  id,
  tag,
  sessions,
  selectedSession,
  onSelectSession,
  getTagsForSession,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })

  const isHex = tag?.color?.startsWith('#')

  return (
    <div className="flex flex-col w-64 min-w-[256px] flex-shrink-0">
      {/* Column Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 mb-1">
        {tag ? (
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isHex ? '' : getColorClass(tag.color)}`}
            style={getColorStyle(tag.color)}
          />
        ) : (
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-muted-foreground/30" />
        )}
        <span className="text-xs font-medium text-foreground flex-1 truncate">
          {tag?.name || 'Untagged'}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-muted/50">
          {sessions.length}
        </span>
      </div>

      {/* Column Content */}
      <div
        ref={setNodeRef}
        className={[
          'flex-1 rounded-lg border p-1.5 min-h-[120px] max-h-[calc(100vh-180px)] overflow-y-auto transition-colors',
          'bg-muted/20 border-border/30',
          isOver ? 'border-primary/50 bg-primary/5' : '',
        ].filter(Boolean).join(' ')}
      >
        <SortableContext items={sessions.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5">
            {sessions.map(session => (
              <KanbanCard
                key={session.id}
                session={session}
                tags={getTagsForSession(session.id)}
                isSelected={selectedSession?.id === session.id}
                onSelect={() => onSelectSession(session)}
              />
            ))}
            {sessions.length === 0 && (
              <div className="text-[10px] text-muted-foreground/50 text-center py-6">
                Drop sessions here
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}
