import { useMemo, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useIsMobile } from '@/hooks/useIsMobile'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
// arrayMove available if needed for reordering within column
import type { SessionInfo, Tag, SessionTag, FavoriteItem } from '@/types'
import type { TerminalType } from '@/components/settings/types'
import KanbanColumn from './KanbanColumn'
import KanbanCard from './KanbanCard'
import SearchFilterBar from '@/components/search/SearchFilterBar'
import SessionPreviewModal from './SessionPreviewModal'
import { filterSessions } from '@/utils/sessionFilters'
import { getPathBasename } from '@/utils/path'

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
  onConvertSession?: (session: SessionInfo) => void
  onResumeSession?: (session: SessionInfo) => void | Promise<void>
  favorites?: FavoriteItem[]
  onToggleFavorite?: (item: Omit<FavoriteItem, 'addedAt'>) => void
  terminal?: TerminalType
  piPath?: string
  customCommand?: string
  resumeCommand?: string
  onCreateTag?: (name: string, color: string) => void
  projectFilter?: string | null // null = all projects
  filterTagIds?: string[]
  sourceFilterSlugs?: string[]
  onFilterChange?: (tagIds: string[]) => void
  getDescendantIds?: (tagId: string) => string[]
  liveSessionIds?: Set<string>
}

interface ColumnData {
  id: string
  tag: Tag | null
  sessions: SessionInfo[]
}

const PREVIEW_CLICK_THROUGH_GUARD_MS = 120

export default function KanbanBoard({
  sessions,
  tags,
  sessionTags,
  selectedSession,
  onSelectSession,
  onMoveSession,
  getTagsForSession,
  onToggleTag,
  onDeleteSession,
  onConvertSession,
  onResumeSession,
  favorites,
  onToggleFavorite,
  terminal,
  piPath,
  customCommand,
  resumeCommand,
  projectFilter,
  filterTagIds = [],
  sourceFilterSlugs = [],
  onFilterChange,
  getDescendantIds = () => [],
  liveSessionIds,
}: KanbanBoardProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mobileColIndex, setMobileColIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [previewSession, setPreviewSession] = useState<SessionInfo | null>(null)
  const [initialClickPoint, setInitialClickPoint] = useState<{ x: number; y: number } | null>(null)
  const suppressPreviewOpenUntilRef = useRef(0)

  // Filter sessions by project + search query
  const filteredSessions = useMemo(() => {
    return filterSessions({
      sessions,
      projectFilter,
      searchQuery,
      sourceFilterSlugs,
    })
  }, [sessions, projectFilter, searchQuery, sourceFilterSlugs])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: isMobile ? 10 : 5 },
    })
  )

  // Sort tags by sortOrder
  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => a.sortOrder - b.sortOrder),
    [tags]
  )

  // Build session map for quick lookup (using filtered sessions)
  const sessionMap = useMemo(
    () => new Map(filteredSessions.map(s => [s.id, s])),
    [filteredSessions]
  )

  // Build columns data (using filtered sessions)
  // Order: Untagged first, then tagged columns
  const columns = useMemo<ColumnData[]>(() => {
    const taggedSessionIds = new Set<string>()
    const cols: ColumnData[] = []

    // First, collect all tagged sessions
    for (const tag of sortedTags) {
      const tagSessions = sessionTags
        .filter(st => st.tagId === tag.id)
        .sort((a, b) => a.position - b.position)
        .map(st => sessionMap.get(st.sessionId))
        .filter((s): s is SessionInfo => s !== undefined)

      tagSessions.forEach(s => taggedSessionIds.add(s.id))
    }

    // Untagged column FIRST (before tagged columns)
    const untaggedSessions = filteredSessions.filter(s => !taggedSessionIds.has(s.id))
    cols.push({ id: '__untagged__', tag: null, sessions: untaggedSessions })

    // Then add tagged columns
    for (const tag of sortedTags) {
      const tagSessions = sessionTags
        .filter(st => st.tagId === tag.id)
        .sort((a, b) => a.position - b.position)
        .map(st => sessionMap.get(st.sessionId))
        .filter((s): s is SessionInfo => s !== undefined)

      cols.push({ id: tag.id, tag, sessions: tagSessions })
    }

    return cols
  }, [sortedTags, filteredSessions, sessionTags, sessionMap])

  // Get active session for drag overlay
  const activeSession = activeId ? sessionMap.get(activeId) : null

  // Find which column a session belongs to
  const findColumnForSession = useCallback((sessionId: string): string | null => {
    for (const col of columns) {
      if (col.sessions.some(s => s.id === sessionId)) {
        return col.id
      }
    }
    return null
  }, [columns])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Could add visual feedback here
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const sessionId = active.id as string
    const overId = over.id as string

    // Find source column
    const fromColId = findColumnForSession(sessionId)
    if (!fromColId) return

    // Determine target column
    let toColId: string
    let position = 0

    // Check if dropped on a column directly
    const targetColumn = columns.find(c => c.id === overId)
    if (targetColumn) {
      toColId = targetColumn.id
      position = targetColumn.sessions.length
    } else {
      // Dropped on another card - find its column
      const targetColId = findColumnForSession(overId)
      if (!targetColId) return
      toColId = targetColId

      // Calculate position
      const targetCol = columns.find(c => c.id === toColId)
      if (targetCol) {
        const overIndex = targetCol.sessions.findIndex(s => s.id === overId)
        position = overIndex >= 0 ? overIndex : targetCol.sessions.length
      }
    }

    // No change needed
    if (fromColId === toColId) return

    // Handle move to untagged
    if (toColId === '__untagged__') {
      if (fromColId !== '__untagged__') {
        onToggleTag(sessionId, fromColId, true) // Remove tag
      }
      return
    }

    // Handle move to tagged column
    const fromTagId = fromColId === '__untagged__' ? null : fromColId
    onMoveSession(sessionId, fromTagId, toColId, position)
  }, [columns, findColumnForSession, onMoveSession, onToggleTag])


  const blockPreviewOpen = useCallback(() => {
    suppressPreviewOpenUntilRef.current = Date.now() + PREVIEW_CLICK_THROUGH_GUARD_MS
  }, [])

  const handleCardClick = useCallback((session: SessionInfo, _rect?: DOMRect, clickPoint?: { x: number; y: number }) => {
    if (Date.now() < suppressPreviewOpenUntilRef.current) {
      return
    }

    setInitialClickPoint(clickPoint ?? null)
    setPreviewSession(session)
  }, [])

  const handleClosePreviewStart = useCallback(() => {
    blockPreviewOpen()
  }, [blockPreviewOpen])

  const handleClosePreview = useCallback(() => {
    setPreviewSession(null)
    setInitialClickPoint(null)
  }, [])

  const handleExpandToFull = useCallback(() => {
    if (!previewSession) {
      return
    }

    blockPreviewOpen()
    onSelectSession(previewSession)
    setPreviewSession(null)
    setInitialClickPoint(null)
  }, [blockPreviewOpen, onSelectSession, previewSession])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 flex-shrink-0 relative z-20" data-tauri-drag-region>
        <h2 className="text-sm font-medium text-foreground shrink-0">
          {t('tags.kanban.title')}
        </h2>
        {projectFilter ? (
          <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[11px] shrink-0">
            {getPathBasename(projectFilter)}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {t('tags.kanban.allProjects', 'All Projects')}
          </span>
        )}
        <div className="flex-1 min-w-0 max-w-[360px]">
          <SearchFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            tags={tags}
            sessionTags={sessionTags}
            filterTagIds={filterTagIds}
            onFilterChange={onFilterChange || (() => {})}
            getDescendantIds={getDescendantIds}
            compact
          />
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {filteredSessions.length} {t('project.list.sessions')}
        </span>
      </div>

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {isMobile ? (
          /* Mobile: single column with swipe nav */
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Column tabs */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/30 overflow-x-auto flex-shrink-0">
              {columns.map((col, i) => (
                <button
                  key={col.id}
                  onClick={() => setMobileColIndex(i)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap motion-color motion-press focus-ring ${
                    mobileColIndex === i
                      ? 'bg-secondary text-foreground font-medium'
                      : 'text-muted-foreground'
                  }`}
                >
                  {col.tag?.name || t('tags.kanban.untagged')}
                  <span className="text-[9px] opacity-60">{col.sessions.length}</span>
                </button>
              ))}
            </div>
            {/* Active column */}
            <div className="flex-1 min-h-0 p-3">
              {columns[mobileColIndex] && (
                <KanbanColumn
                  id={columns[mobileColIndex].id}
                  tag={columns[mobileColIndex].tag}
                  sessions={columns[mobileColIndex].sessions}
                  selectedSession={selectedSession}
                  onSelectSession={handleCardClick}
                  getTagsForSession={getTagsForSession}
                  allTags={tags}
                  favorites={favorites || []}
                    onToggleFavorite={onToggleFavorite || (() => {})}
                    onToggleTag={onToggleTag}
                    onDeleteSession={onDeleteSession}
                    onResumeSession={onResumeSession}
                    isMobile
                    liveSessionIds={liveSessionIds}
                />
              )}
            </div>
          </div>
        ) : (
          /* Desktop: horizontal scroll */
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4">
            <div className="kanban-board flex gap-3 h-full min-h-0">
              {columns.map(col => (
                <div key={col.id} className="kanban-column">
                  <KanbanColumn
                    id={col.id}
                    tag={col.tag}
                    sessions={col.sessions}
                    selectedSession={selectedSession}
                    onSelectSession={handleCardClick}
                    getTagsForSession={getTagsForSession}
                    allTags={tags}
                    favorites={favorites || []}
                    onToggleFavorite={onToggleFavorite || (() => {})}
                    onToggleTag={onToggleTag}
                    onDeleteSession={onDeleteSession}
                    onResumeSession={onResumeSession}
                    liveSessionIds={liveSessionIds}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Drag Overlay */}
        <DragOverlay dropAnimation={null}>
          {activeSession && (
            <KanbanCard
              session={activeSession}
              tags={getTagsForSession(activeSession.id)}
              isSelected={false}
              isOverlay
              onSelect={() => {}}
            />
          )}
        </DragOverlay>
      </DndContext>

      {/* Session Preview Modal */}
      <SessionPreviewModal
        session={previewSession}
        isOpen={!!previewSession}
        onClose={handleClosePreview}
        onCloseStart={handleClosePreviewStart}
        onExpand={handleExpandToFull}
        onConvert={
          previewSession && onConvertSession
            ? () => onConvertSession(previewSession)
            : undefined
        }
        terminal={terminal}
        piPath={piPath}
        customCommand={customCommand}
        resumeCommand={resumeCommand}
        initialClickPoint={initialClickPoint}
        animationMode="origin-point"
      />
    </div>
  )
}
