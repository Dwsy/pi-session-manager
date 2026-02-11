import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { useState } from 'react'
import KanbanColumn from './KanbanColumn'
import KanbanCard from './KanbanCard'
import type { SessionInfo, Tag, SessionTag, FavoriteItem } from '../../types'
import type { TerminalType } from '../settings/types'

interface KanbanBoardProps {
  sessions: SessionInfo[]
  tags: Tag[]
  sessionTags: SessionTag[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
  onMoveSession: (sessionId: string, fromTagId: string | null, toTagId: string, position: number) => void
  getTagsForSession: (sessionId: string) => Tag[]
  onToggleTag: (sessionId: string, tagId: string, assigned: boolean) => void
  onDeleteSession?: (session: SessionInfo) => void
  favorites?: FavoriteItem[]
  onToggleFavorite?: (item: Omit<FavoriteItem, 'addedAt'>) => void
  terminal?: TerminalType
  piPath?: string
  customCommand?: string
  onCreateTag?: (name: string, color: string) => void
}

export default function KanbanBoard({
  sessions, tags, sessionTags, selectedSession,
  onSelectSession, onMoveSession, getTagsForSession,
  onToggleTag, onDeleteSession, favorites = [],
  onToggleFavorite,
}: KanbanBoardProps) {
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Build columns: sorted tags + untagged
  const sortedTags = useMemo(() => [...tags].sort((a, b) => a.sortOrder - b.sortOrder), [tags])

  const taggedSessionIds = useMemo(() => new Set(sessionTags.map(st => st.sessionId)), [sessionTags])

  const columns = useMemo(() => {
    const cols: { id: string; tag: Tag | null; sessions: SessionInfo[] }[] = []
    const sessionMap = new Map(sessions.map(s => [s.id, s]))

    for (const tag of sortedTags) {
      const tagSTs = sessionTags.filter(st => st.tagId === tag.id).sort((a, b) => a.position - b.position)
      const colSessions = tagSTs.map(st => sessionMap.get(st.sessionId)).filter(Boolean) as SessionInfo[]
      cols.push({ id: tag.id, tag, sessions: colSessions })
    }

    // Untagged column
    const untagged = sessions.filter(s => !taggedSessionIds.has(s.id))
    cols.push({ id: '__untagged__', tag: null, sessions: untagged })

    return cols
  }, [sortedTags, sessions, sessionTags, taggedSessionIds])

  const activeSession = activeId ? sessions.find(s => s.id === activeId) : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const sessionId = active.id as string
    const targetColId = (over.data.current?.columnId as string) || (over.id as string)

    if (targetColId === '__untagged__') return

    // Find current tag for this session
    const currentTags = getTagsForSession(sessionId)
    const fromTagId = currentTags.length > 0 ? currentTags[0].id : null

    if (fromTagId === targetColId) return

    onMoveSession(sessionId, fromTagId, targetColId, 0)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 flex-shrink-0">
        <h2 className="text-sm font-medium text-foreground">{t('tags.kanban.title')}</h2>
        <span className="text-[10px] text-muted-foreground">{t('tags.kanban.dragHint')}</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
          <div className="flex gap-3 h-full min-w-max">
            {columns.map(col => (
              <KanbanColumn
                key={col.id}
                id={col.id}
                tag={col.tag}
                sessions={col.sessions}
                selectedSession={selectedSession}
                onSelectSession={onSelectSession}
                tags={tags}
                getTagsForSession={getTagsForSession}
                onToggleTag={onToggleTag}
                onDeleteSession={onDeleteSession}
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeSession && (
            <KanbanCard session={activeSession} isOverlay tags={tags} getTagsForSession={getTagsForSession} />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
