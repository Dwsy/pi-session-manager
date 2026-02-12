import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Kanban, dropHandler } from 'react-kanban-kit'
import type { BoardData, BoardItem } from 'react-kanban-kit'
import { Clock, MessageSquare } from 'lucide-react'
import type { SessionInfo, Tag, SessionTag, FavoriteItem } from '../../types'
import type { TerminalType } from '../settings/types'
import TagBadge from '../TagBadge'
import { getColorClass, getColorStyle } from '../TagBadge'

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

function buildBoardData(
  sessions: SessionInfo[],
  sortedTags: Tag[],
  sessionTags: SessionTag[],
  untaggedLabel: string,
): BoardData {
  const colIds = [...sortedTags.map(t => t.id), 'untagged']
  const data: BoardData = {
    root: { id: 'root', title: 'Root', children: colIds, totalChildrenCount: colIds.length, parentId: null },
  }
  for (const tag of sortedTags) {
    data[tag.id] = { id: tag.id, title: tag.name, children: [], totalChildrenCount: 0, parentId: 'root' }
  }
  data['untagged'] = { id: 'untagged', title: untaggedLabel, children: [], totalChildrenCount: 0, parentId: 'root' }

  const sessionPrimaryCol = new Map<string, string>()
  const tagOrder = new Map(sortedTags.map((t, i) => [t.id, i]))
  for (const st of sessionTags) {
    const cur = sessionPrimaryCol.get(st.sessionId)
    if (!cur || (tagOrder.get(st.tagId) ?? Infinity) < (tagOrder.get(cur) ?? Infinity)) {
      sessionPrimaryCol.set(st.sessionId, st.tagId)
    }
  }

  for (const s of sessions) {
    const colId = sessionPrimaryCol.get(s.id) ?? 'untagged'
    if (!data[colId]) continue
    data[s.id] = {
      id: s.id, title: s.name || s.first_message || 'Untitled',
      parentId: colId, children: [], totalChildrenCount: 0,
      type: 'card', content: { session: s },
    }
    data[colId].children.push(s.id)
    data[colId].totalChildrenCount++
  }
  return data
}

export default function KanbanBoard({
  sessions, tags, sessionTags, selectedSession,
  onSelectSession, onMoveSession, onToggleTag, getTagsForSession,
}: KanbanBoardProps) {
  const { t } = useTranslation()
  const sortedTags = useMemo(() => [...tags].sort((a, b) => a.sortOrder - b.sortOrder), [tags])

  const derived = useMemo(
    () => buildBoardData(sessions, sortedTags, sessionTags, t('tags.kanban.untagged')),
    [sessions, sortedTags, sessionTags, t],
  )
  const [board, setBoard] = useState<BoardData>(derived)
  useEffect(() => { setBoard(derived) }, [derived])

  const handleCardMove = useCallback((move: {
    cardId: string; fromColumnId: string; toColumnId: string
    taskAbove: string | null; taskBelow: string | null; position: number
  }) => {
    const { fromColumnId, toColumnId, cardId } = move
    if (fromColumnId === toColumnId) return
    setBoard(prev => dropHandler(
      move, prev,
      () => {},
      (col) => ({ ...col, totalChildrenCount: col.children.length }),
      (col) => ({ ...col, totalChildrenCount: col.children.length }),
    ))
    if (toColumnId === 'untagged') {
      if (fromColumnId !== 'untagged') onToggleTag(cardId, fromColumnId, true)
    } else {
      onMoveSession(cardId, fromColumnId === 'untagged' ? null : fromColumnId, toColumnId, move.position)
    }
  }, [onMoveSession, onToggleTag])

  const tagMap = useMemo(() => new Map(tags.map(t => [t.id, t])), [tags])

  return (
    <div className="kanban-board-root">
      <Kanban
        dataSource={board}
        onCardMove={handleCardMove}
        configMap={{
          card: {
            render: ({ data }: { data: BoardItem; column: BoardItem; index: number; isDraggable: boolean }) => {
              const session: SessionInfo | undefined = data.content?.session
              if (!session) return null
              const selected = selectedSession?.id === session.id
              const sTags = getTagsForSession(session.id)
              const diff = Date.now() - new Date(session.modified).getTime()
              const mins = Math.floor(diff / 60000)
              const timeLabel = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`
              const dir = session.cwd?.split('/').filter(Boolean).slice(-2).join('/') || ''
              return (
                <div
                  onClick={() => onSelectSession(session)}
                  className={`kanban-card ${selected ? 'kanban-card--selected' : ''}`}
                >
                  <div className="kanban-card__header">
                    <span className="kanban-card__title">
                      {session.name || session.first_message || 'Untitled'}
                    </span>
                    {sTags.length > 0 && (
                      <span className="kanban-card__tags">
                        {sTags.slice(0, 3).map(tag => <TagBadge key={tag.id} tag={tag} compact />)}
                      </span>
                    )}
                  </div>
                  {session.last_message && (
                    <p className="kanban-card__message">{session.last_message}</p>
                  )}
                  <div className="kanban-card__meta">
                    <span><MessageSquare size={10} />{session.message_count}</span>
                    <span><Clock size={10} />{timeLabel}</span>
                    {dir && <span className="kanban-card__dir">{dir}</span>}
                  </div>
                </div>
              )
            },
            isDraggable: true,
          },
        }}
        virtualization={false}
        cardsGap={6}
        renderColumnHeader={(col) => {
          const tag = tagMap.get(col.id)
          const isHex = tag?.color.startsWith('#')
          return (
            <div className="kanban-col-header">
              {tag ? (
                <span className={`kanban-col-header__dot ${isHex ? '' : getColorClass(tag.color)}`} style={getColorStyle(tag.color)} />
              ) : (
                <span className="kanban-col-header__dot kanban-col-header__dot--muted" />
              )}
              <span className="kanban-col-header__title">{col.title}</span>
              <span className="kanban-col-header__count">{col.children.length}</span>
            </div>
          )
        }}
      />
      <style>{`
        .kanban-board-root { height: 100%; overflow: auto; padding: 16px; }
        .kanban-board-root .rkk-board { display: flex; gap: 12px; align-items: flex-start; height: 100%; }
        .kanban-board-root .rkk-column-outer { width: 264px !important; min-width: 264px !important; flex-shrink: 0; }
        .kanban-board-root .rkk-column { background: var(--color-bg-subtle, hsl(var(--background))); border: 1px solid hsl(var(--border) / 0.3); border-radius: 0.5rem; }
        .kanban-board-root .rkk-column-wrapper { display: flex; flex-direction: column; max-height: calc(100vh - 120px); }
        .kanban-board-root .rkk-column-content { overflow-y: auto; padding: 6px; min-height: 80px; }
        .kanban-board-root .rkk-column-content-list { display: flex; flex-direction: column; }
        .kanban-col-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; }
        .kanban-col-header__dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .kanban-col-header__dot--muted { background: hsl(var(--muted-foreground) / 0.3); }
        .kanban-col-header__title { font-size: 12px; font-weight: 500; color: hsl(var(--foreground)); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .kanban-col-header__count { font-size: 9px; color: hsl(var(--muted-foreground)); padding: 2px 6px; border-radius: 4px; background: hsl(var(--muted) / 0.3); font-variant-numeric: tabular-nums; }
        .kanban-card { background: hsl(var(--surface, var(--card))); border: 1px solid hsl(var(--border) / 0.3); border-radius: 6px; padding: 10px; cursor: pointer; }
        .kanban-card:hover { border-color: hsl(var(--border) / 0.6); }
        .kanban-card--selected { background: hsl(217 91% 60% / 0.05); border-color: hsl(217 91% 60% / 0.3); }
        .kanban-card__header { display: flex; align-items: flex-start; gap: 6px; margin-bottom: 6px; }
        .kanban-card__title { font-size: 11px; font-weight: 500; color: hsl(var(--foreground)); line-height: 1.3; flex: 1; min-width: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .kanban-card__tags { display: flex; gap: 2px; flex-shrink: 0; margin-top: 2px; }
        .kanban-card__message { font-size: 9px; color: hsl(var(--muted-foreground)); margin: 0 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .kanban-card__meta { display: flex; align-items: center; gap: 8px; font-size: 9px; color: hsl(var(--muted-foreground) / 0.6); }
        .kanban-card__meta span { display: inline-flex; align-items: center; gap: 2px; }
        .kanban-card__dir { font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; text-align: right; }
      `}</style>
    </div>
  )
}
