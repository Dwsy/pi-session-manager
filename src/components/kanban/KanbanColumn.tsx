import { useRef, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useVirtualizer } from '@tanstack/react-virtual'
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

// Threshold for enabling virtualization
const VIRTUALIZATION_THRESHOLD = 50
const ESTIMATED_CARD_HEIGHT = 72

export default function KanbanColumn({
  id,
  tag,
  sessions,
  selectedSession,
  onSelectSession,
  getTagsForSession,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const scrollRef = useRef<HTMLDivElement>(null)

  const isHex = tag?.color?.startsWith('#')
  const useVirtual = sessions.length > VIRTUALIZATION_THRESHOLD

  // Virtualizer for large lists
  const virtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: 5,
    enabled: useVirtual,
  })

  // Memoize session IDs for SortableContext
  const sessionIds = useMemo(() => sessions.map(s => s.id), [sessions])

  // Render cards - virtualized or normal
  const renderCards = () => {
    if (useVirtual) {
      const items = virtualizer.getVirtualItems()
      return (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {items.map(virtualRow => {
            const session = sessions[virtualRow.index]
            return (
              <div
                key={session.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="pb-1.5">
                  <KanbanCard
                    session={session}
                    tags={getTagsForSession(session.id)}
                    isSelected={selectedSession?.id === session.id}
                    onSelect={() => onSelectSession(session)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )
    }

    // Normal rendering for small lists
    return (
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
      </div>
    )
  }

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
          'flex-1 rounded-lg border p-1.5 min-h-[120px] transition-colors',
          'bg-muted/20 border-border/30',
          isOver ? 'border-primary/50 bg-primary/5' : '',
        ].filter(Boolean).join(' ')}
      >
        <div
          ref={scrollRef}
          className="max-h-[calc(100vh-180px)] overflow-y-auto"
        >
          <SortableContext items={sessionIds} strategy={verticalListSortingStrategy}>
            {renderCards()}
            {sessions.length === 0 && (
              <div className="text-[10px] text-muted-foreground/50 text-center py-6">
                Drop sessions here
              </div>
            )}
          </SortableContext>
        </div>
      </div>
    </div>
  )
}
