import { useMemo, useState, useCallback, useRef, useEffect, type HTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useIsMobile } from '@/hooks/useIsMobile'
import { AlignJustify, Loader2, Plus, Rows3 } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SessionInfo, Tag, SessionTag, FavoriteItem } from '@/types'
import type { TerminalType } from '@/components/settings/types'
import KanbanColumn from './KanbanColumn'
import KanbanCard from './KanbanCard'
import KanbanBulkToolbar from './KanbanBulkToolbar'
import SearchFilterBar from '@/components/search/SearchFilterBar'
import SessionPreviewModal from '@/components/session-preview/SessionPreviewModal'
import TimeRangeSelector from './TimeRangeSelector'
import type { TimeRange } from '@/utils/sessionFilters'
import { filterSessions } from '@/utils/sessionFilters'
import { getPathBasename } from '@/utils/path'
import {
  buildKanbanColumns,
  DESKTOP_KANBAN_COLUMN_WIDTH,
  filterColumnSessions,
  reorderTagColumnIds,
  UNTAGGED_COLUMN_ID,
  type KanbanCardDensity,
  type KanbanColumnData,
} from './kanbanBoardModel'

interface KanbanBoardProps {
  sessions: SessionInfo[]
  tags: Tag[]
  sessionTags: SessionTag[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
  onMoveSession: (sessionId: string, fromTagId: string | null, toTagId: string, position: number) => void
  getTagsForSession: (sessionId: string) => Tag[]
  onToggleTag: (sessionId: string, tagId: string, assigned: boolean) => void
  onDeleteSession?: (
    session: SessionInfo,
    options?: import('@/components/dialogs/deleteSessionTypes').DeleteSessionRequestOptions,
  ) => void
  onDeleteSessions?: (
    sessions: SessionInfo[],
    options?: import('@/components/dialogs/deleteSessionTypes').DeleteSessionRequestOptions,
  ) => void
  onConvertSession?: (session: SessionInfo) => void
  onResumeSession?: (session: SessionInfo) => void | Promise<void>
  onCopyResumeSession?: (session: SessionInfo) => void | Promise<void>
  onOpenPreviewRenameDialog?: (session: SessionInfo) => void
  onNewSession?: (cwd: string) => void | Promise<void> // New session in terminal
  favorites?: FavoriteItem[]
  onToggleFavorite?: (item: Omit<FavoriteItem, 'addedAt'>) => void
  terminal?: TerminalType
  piPath?: string
  customCommand?: string
  resumeCommand?: string
  onCreateTag?: (name: string, color: string) => void
  columnOrder?: string[]
  onColumnOrderChange?: (tagIds: string[]) => void | Promise<void>
  cardDensity?: KanbanCardDensity
  onCardDensityChange?: (density: KanbanCardDensity) => void | Promise<void>
  projectFilter?: string | null // null = all projects
  filterTagIds?: string[]
  sourceFilterSlugs?: string[]
  onFilterChange?: (tagIds: string[]) => void
  getDescendantIds?: (tagId: string) => string[]
  liveSessionIds?: Set<string>
  loading?: boolean
}

const PREVIEW_CLICK_THROUGH_GUARD_MS = 120
const COLUMN_SORTABLE_PREFIX = 'column:'
const DND_MEASURING = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
}

function columnSortableId(columnId: string) {
  return `${COLUMN_SORTABLE_PREFIX}${columnId}`
}

function isColumnSortableId(id: string) {
  return id.startsWith(COLUMN_SORTABLE_PREFIX)
}

function columnIdFromDndId(id: string) {
  return isColumnSortableId(id) ? id.slice(COLUMN_SORTABLE_PREFIX.length) : id
}

interface SortableColumnFrameProps {
  column: KanbanColumnData
  disabled?: boolean
  children: (props: {
    dragHandleProps?: HTMLAttributes<HTMLButtonElement>
    isDragging: boolean
  }) => ReactNode
}

function SortableColumnFrame({ column, disabled, children }: SortableColumnFrameProps) {
  const sortableId = columnSortableId(column.id)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: sortableId,
    disabled,
    data: { type: 'column', columnId: column.id },
  })

  return (
    <div
      ref={setNodeRef}
      className="h-full min-h-0 flex-none"
      style={{
        flex: `0 0 ${DESKTOP_KANBAN_COLUMN_WIDTH}px`,
        width: DESKTOP_KANBAN_COLUMN_WIDTH,
        minWidth: DESKTOP_KANBAN_COLUMN_WIDTH,
        maxWidth: DESKTOP_KANBAN_COLUMN_WIDTH,
        scrollSnapAlign: 'start',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : undefined,
      }}
    >
      {children({
        dragHandleProps: disabled
          ? undefined
          : ({ ...attributes, ...listeners } as HTMLAttributes<HTMLButtonElement>),
        isDragging,
      })}
    </div>
  )
}

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
  onDeleteSessions,
  onConvertSession,
  onResumeSession,
  onCopyResumeSession,
  onOpenPreviewRenameDialog,
  onNewSession,
  favorites,
  onToggleFavorite,
  terminal,
  piPath,
  customCommand,
  resumeCommand,
  columnOrder = [],
  onColumnOrderChange,
  cardDensity = 'comfortable',
  onCardDensityChange,
  projectFilter,
  filterTagIds = [],
  sourceFilterSlugs = [],
  onFilterChange,
  getDescendantIds = () => [],
  liveSessionIds,
  loading = false,
}: KanbanBoardProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null)
  const [activeOverColumnId, setActiveOverColumnId] = useState<string | null>(null)
  const [mobileColIndex, setMobileColIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [previewSession, setPreviewSession] = useState<SessionInfo | null>(null)
  const [initialClickPoint, setInitialClickPoint] = useState<{ x: number; y: number } | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('any')
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(() => new Set())
  const [columnQueries, setColumnQueries] = useState<Record<string, string>>({})
  const suppressPreviewOpenUntilRef = useRef(0)

  // Filter sessions by project + search query + time range
  const filteredSessions = useMemo(() => {
    return filterSessions({
      sessions,
      projectFilter,
      searchQuery,
      sourceFilterSlugs,
      filterTagIds,
      sessionTags,
      getDescendantIds,
      timeRange,
    })
  }, [sessions, projectFilter, searchQuery, sourceFilterSlugs, filterTagIds, sessionTags, getDescendantIds, timeRange])

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

  useEffect(() => {
    setSelectedSessionIds((prev) => {
      const next = new Set([...prev].filter((id) => sessionMap.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [sessionMap])

  const selectedSessions = useMemo(
    () => [...selectedSessionIds]
      .map((id) => sessionMap.get(id))
      .filter((session): session is SessionInfo => session !== undefined),
    [selectedSessionIds, sessionMap],
  )

  const toggleBulkSelect = useCallback((sessionId: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }, [])

  const clearBulkSelection = useCallback(() => {
    setSelectedSessionIds(new Set())
  }, [])

  const columns = useMemo(
    () => buildKanbanColumns({
      sessions: filteredSessions,
      tags: sortedTags,
      sessionTags,
      columnOrder,
    }),
    [columnOrder, filteredSessions, sortedTags, sessionTags],
  )

  const displayColumns = useMemo(
    () => columns.map((column) => ({
      ...column,
      sessions: filterColumnSessions(column.sessions, columnQueries[column.id] ?? ''),
      totalSessionCount: column.sessions.length,
    })),
    [columnQueries, columns],
  )

  const columnIds = useMemo(() => new Set(columns.map(col => col.id)), [columns])
  const sortableColumnIds = useMemo(
    () => columns.filter((col) => col.id !== UNTAGGED_COLUMN_ID).map((col) => columnSortableId(col.id)),
    [columns],
  )

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const withoutActive = (collisions: ReturnType<CollisionDetection>) =>
      collisions.filter(collision => collision.id !== args.active.id)

    if (args.active.data.current?.type === 'column') {
      const onlyColumns = (collisions: ReturnType<CollisionDetection>) =>
        withoutActive(collisions).filter((collision) => isColumnSortableId(String(collision.id)))

      const pointerColumns = onlyColumns(pointerWithin(args))
      if (pointerColumns.length > 0) return pointerColumns

      const rectColumns = onlyColumns(rectIntersection(args))
      if (rectColumns.length > 0) return rectColumns

      return onlyColumns(closestCorners(args))
    }

    const withoutColumnSortables = (collisions: ReturnType<CollisionDetection>) =>
      withoutActive(collisions).filter((collision) => !isColumnSortableId(String(collision.id)))

    const pointerCollisions = withoutColumnSortables(pointerWithin(args))
    if (pointerCollisions.length > 0) {
      return pointerCollisions
    }

    const rectCollisions = withoutColumnSortables(rectIntersection(args))
    if (rectCollisions.length > 0) {
      const cardCollisions = rectCollisions.filter(collision => !columnIds.has(String(collision.id)))
      return cardCollisions.length > 0 ? cardCollisions : rectCollisions
    }

    return withoutColumnSortables(closestCorners(args))
  }, [columnIds])

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

  const resolveOverColumnId = useCallback((overId: string): string | null => {
    const targetColumn = columns.find(c => c.id === overId)
    if (targetColumn) return targetColumn.id
    return findColumnForSession(overId)
  }, [columns, findColumnForSession])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (event.active.data.current?.type === 'column') {
      setActiveColumnId(String(event.active.data.current.columnId ?? columnIdFromDndId(String(event.active.id))))
      setActiveId(null)
      setActiveOverColumnId(null)
      return
    }

    setActiveId(event.active.id as string)
    setActiveOverColumnId(findColumnForSession(event.active.id as string))
  }, [findColumnForSession])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    if (event.active.data.current?.type === 'column') return
    const overId = event.over?.id
    setActiveOverColumnId(overId ? resolveOverColumnId(overId as string) : null)
  }, [resolveOverColumnId])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setActiveColumnId(null)
    setActiveOverColumnId(null)

    if (!over) return

    if (active.data.current?.type === 'column') {
      const activeColumn = String(active.data.current.columnId ?? columnIdFromDndId(String(active.id)))
      const overColumn = String(over.data.current?.columnId ?? columnIdFromDndId(String(over.id)))
      const currentOrder = columns
        .filter((column) => column.id !== UNTAGGED_COLUMN_ID)
        .map((column) => column.id)
      const nextOrder = reorderTagColumnIds(currentOrder, activeColumn, overColumn)
      if (nextOrder.some((id, index) => id !== currentOrder[index])) {
        void onColumnOrderChange?.(nextOrder)
      }
      return
    }

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
    if (toColId === UNTAGGED_COLUMN_ID) {
      if (fromColId !== UNTAGGED_COLUMN_ID) {
        onToggleTag(sessionId, fromColId, true) // Remove tag
      }
      return
    }

    // Handle move to tagged column
    const fromTagId = fromColId === UNTAGGED_COLUMN_ID ? null : fromColId
    onMoveSession(sessionId, fromTagId, toColId, position)
  }, [columns, findColumnForSession, onColumnOrderChange, onMoveSession, onToggleTag])

  const handleBulkMoveToTag = useCallback((tagId: string) => {
    const targetColumn = columns.find((column) => column.id === tagId)
    let position = targetColumn?.sessions.length ?? 0

    for (const session of selectedSessions) {
      const fromColId = findColumnForSession(session.id)
      if (!fromColId || fromColId === tagId) continue
      const fromTagId = fromColId === UNTAGGED_COLUMN_ID ? null : fromColId
      onMoveSession(session.id, fromTagId, tagId, position)
      position += 1
    }

    clearBulkSelection()
  }, [clearBulkSelection, columns, findColumnForSession, onMoveSession, selectedSessions])

  const handleBulkDelete = useCallback(() => {
    if (selectedSessions.length === 0) return
    if (onDeleteSessions) {
      onDeleteSessions(selectedSessions)
    } else {
      for (const session of selectedSessions) {
        onDeleteSession?.(session)
      }
    }
    clearBulkSelection()
  }, [clearBulkSelection, onDeleteSession, onDeleteSessions, selectedSessions])

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

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 flex-shrink-0 relative z-20" data-tauri-drag-region>
          <h2 className="text-sm font-medium text-foreground shrink-0">
            {t('plugins.kanbanBoard.title', 'Kanban Board')}
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 flex-shrink-0 relative z-20" data-tauri-drag-region>
        <h2 className="text-sm font-medium text-foreground shrink-0">
          {t('plugins.kanbanBoard.title', 'Kanban Board')}
        </h2>
        {projectFilter ? (
          <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 text-[11px] shrink-0">
            {getPathBasename(projectFilter)}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {t('plugins.kanbanBoard.allProjects', 'All Projects')}
          </span>
        )}
        <div className="flex-1 min-w-0 max-w-[480px]">
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
        <KanbanBulkToolbar
          selectedCount={selectedSessions.length}
          tags={sortedTags}
          onMoveToTag={handleBulkMoveToTag}
          onDeleteSelected={handleBulkDelete}
          onClearSelection={clearBulkSelection}
        />
        <div className="flex items-center rounded-md border border-border/35 bg-background/40 p-0.5">
          <button
            type="button"
            className={`flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-ring ${cardDensity === 'comfortable' ? 'bg-secondary text-foreground' : ''}`}
            title={t('plugins.kanbanBoard.density.comfortable', 'Comfortable')}
            aria-label={t('plugins.kanbanBoard.density.comfortable', 'Comfortable')}
            onClick={() => onCardDensityChange?.('comfortable')}
          >
            <Rows3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={`flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-ring ${cardDensity === 'compact' ? 'bg-secondary text-foreground' : ''}`}
            title={t('plugins.kanbanBoard.density.compact', 'Compact')}
            aria-label={t('plugins.kanbanBoard.density.compact', 'Compact')}
            onClick={() => onCardDensityChange?.('compact')}
          >
            <AlignJustify className="h-3.5 w-3.5" />
          </button>
        </div>
        <TimeRangeSelector
          value={timeRange}
          onChange={setTimeRange}
          compact
        />
        {onNewSession && (
          <button
            onClick={() => onNewSession(projectFilter || '')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-accent/25 bg-accent/15 text-foreground hover:bg-accent/25 hover:border-accent/40 text-[11px] shrink-0 motion-color motion-press focus-ring"
            title={t('plugins.kanbanBoard.newSession', 'New Session')}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t('plugins.kanbanBoard.newSessionShort', 'New')}</span>
          </button>
        )}
      </div>

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={DND_MEASURING}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {isMobile ? (
          /* Mobile: single column with swipe nav */
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Column tabs */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/30 overflow-x-auto flex-shrink-0">
              {displayColumns.map((col, i) => (
                <button
                  key={col.id}
                  onClick={() => setMobileColIndex(i)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] whitespace-nowrap motion-color motion-press focus-ring ${
                    mobileColIndex === i
                      ? 'bg-secondary text-foreground font-medium'
                      : 'text-muted-foreground'
                  }`}
                >
                  {col.tag?.name || t('plugins.kanbanBoard.untagged', 'Unlabeled')}
                  <span className="text-[9px] opacity-60">{col.sessions.length}</span>
                </button>
              ))}
            </div>
            {/* Active column */}
            <div className="flex-1 min-h-0 p-3">
              {displayColumns[mobileColIndex] && (
                <KanbanColumn
                  id={displayColumns[mobileColIndex].id}
                  tag={displayColumns[mobileColIndex].tag}
                  sessions={displayColumns[mobileColIndex].sessions}
                  selectedSession={selectedSession}
                  onSelectSession={handleCardClick}
                  getTagsForSession={getTagsForSession}
                  allTags={tags}
                  favorites={favorites || []}
                    onToggleFavorite={onToggleFavorite || (() => {})}
                    onToggleTag={onToggleTag}
                    onDeleteSession={onDeleteSession}
                    onResumeSession={onResumeSession}
                    onCopyResumeSession={onCopyResumeSession}
                    onOpenPreviewRenameDialog={onOpenPreviewRenameDialog}
                    isMobile
                    liveSessionIds={liveSessionIds}
                    hideProjectInfo={!!projectFilter}
                    isDropTarget={activeOverColumnId === displayColumns[mobileColIndex].id && activeId !== null}
                    selectedSessionIds={selectedSessionIds}
                    selectionMode={selectedSessionIds.size > 0}
                    onToggleBulkSelect={toggleBulkSelect}
                    density={cardDensity}
                    columnSearchQuery={columnQueries[displayColumns[mobileColIndex].id] ?? ''}
                    onColumnSearchChange={(query) => setColumnQueries((prev) => ({ ...prev, [displayColumns[mobileColIndex].id]: query }))}
                    totalSessionCount={displayColumns[mobileColIndex].totalSessionCount}
                />
              )}
            </div>
          </div>
        ) : (
          /* Desktop: horizontal scroll */
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-3">
            <div
              className="flex items-stretch gap-2 h-full min-h-0 overflow-x-auto"
              style={{ WebkitOverflowScrolling: 'touch', scrollSnapType: 'x mandatory' }}
            >
              <SortableContext items={sortableColumnIds} strategy={horizontalListSortingStrategy}>
                {displayColumns.map(col => (
                  <SortableColumnFrame
                    key={col.id}
                    column={col}
                    disabled={col.id === UNTAGGED_COLUMN_ID || !onColumnOrderChange}
                  >
                    {({ dragHandleProps, isDragging }) => (
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
                        onCopyResumeSession={onCopyResumeSession}
                        onOpenPreviewRenameDialog={onOpenPreviewRenameDialog}
                        liveSessionIds={liveSessionIds}
                        hideProjectInfo={!!projectFilter}
                        isDropTarget={activeOverColumnId === col.id && activeId !== null}
                        columnDragHandleProps={dragHandleProps}
                        isColumnDragging={activeColumnId === col.id || isDragging}
                        selectedSessionIds={selectedSessionIds}
                        selectionMode={selectedSessionIds.size > 0}
                        onToggleBulkSelect={toggleBulkSelect}
                        density={cardDensity}
                        columnSearchQuery={columnQueries[col.id] ?? ''}
                        onColumnSearchChange={(query) => setColumnQueries((prev) => ({ ...prev, [col.id]: query }))}
                        totalSessionCount={col.totalSessionCount}
                      />
                    )}
                  </SortableColumnFrame>
                ))}
              </SortableContext>
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
              density={cardDensity}
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
        onResumeSession={onResumeSession}
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
