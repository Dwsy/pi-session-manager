import { useDroppable } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import KanbanCard from './KanbanCard'
import type { SessionInfo, Tag, FavoriteItem } from '../../types'
import { getColorClass, getColorStyle } from '../TagBadge'

interface KanbanColumnProps {
  id: string
  tag: Tag | null
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
  tags: Tag[]
  getTagsForSession: (sessionId: string) => Tag[]
  onToggleTag: (sessionId: string, tagId: string, assigned: boolean) => void
  onDeleteSession?: (session: SessionInfo) => void
  favorites?: FavoriteItem[]
  onToggleFavorite?: (item: Omit<FavoriteItem, 'addedAt'>) => void
}

export default function KanbanColumn({
  id, tag, sessions, selectedSession, onSelectSession,
  tags, getTagsForSession,
}: KanbanColumnProps) {
  const { t } = useTranslation()
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { columnId: id },
  })

  const isHex = tag?.color.startsWith('#')

  return (
    <div
      ref={setNodeRef}
      className={`w-64 flex-shrink-0 flex flex-col bg-background/50 rounded-lg border transition-colors ${
        isOver ? 'border-info/50 bg-info/5' : 'border-border/30'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/30">
        {tag ? (
          <span
            className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${isHex ? '' : getColorClass(tag.color)}`}
            style={getColorStyle(tag.color)}
          />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full flex-shrink-0 bg-muted-foreground/30" />
        )}
        <span className="text-xs font-medium text-foreground flex-1 truncate">
          {tag?.name || t('tags.kanban.untagged')}
        </span>
        <span className="text-[9px] text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-muted/30">
          {sessions.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[100px]">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-[10px] text-muted-foreground/40">
            {t('tags.kanban.emptyColumn')}
          </div>
        ) : (
          sessions.map(session => (
            <KanbanCard
              key={session.id}
              session={session}
              isSelected={selectedSession?.id === session.id}
              onSelect={() => onSelectSession(session)}
              tags={tags}
              getTagsForSession={getTagsForSession}
              columnId={id}
            />
          ))
        )}
      </div>
    </div>
  )
}
