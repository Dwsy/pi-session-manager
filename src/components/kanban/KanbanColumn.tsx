import { useRef, useMemo, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import type { SessionInfo, Tag, FavoriteItem } from '@/types'
import KanbanCard from './KanbanCard'
import KanbanContextMenu from './KanbanContextMenu'
import type { DeleteSessionRequestOptions } from '@/components/dialogs/deleteSessionTypes'
import { getColorClass, getColorStyle } from '@/components/tags/TagBadge'
import { invoke, isTauri } from '@/transport'
import { useClipboard } from '@/hooks/useClipboard'
import {
  buildCopyResumeCommand,
  openSessionInTerminalDirect,
} from '@/utils/sessionResume'

interface KanbanColumnProps {
  id: string
  tag: Tag | null
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo, rect: DOMRect, clickPoint?: { x: number; y: number }) => void
  getTagsForSession: (sessionId: string) => Tag[]
  allTags: Tag[]
  favorites: FavoriteItem[]
  onToggleFavorite: (item: Omit<FavoriteItem, 'addedAt'>) => void
  onToggleTag: (sessionId: string, tagId: string, assigned: boolean) => void
  onDeleteSession?: (
    session: SessionInfo,
    options?: DeleteSessionRequestOptions,
  ) => void
  onResumeSession?: (session: SessionInfo) => void | Promise<void>
  onCopyResumeSession?: (session: SessionInfo) => void | Promise<void>
  terminal?: string
  piPath?: string
  customCommand?: string
  resumeCommand?: string
  isMobile?: boolean
  liveSessionIds?: Set<string>
  hideProjectInfo?: boolean
}

// Threshold for enabling virtualization
const VIRTUALIZATION_THRESHOLD = 50
const ESTIMATED_CARD_HEIGHT = 80

export default function KanbanColumn({
  id,
  tag,
  sessions,
  selectedSession,
  onSelectSession,
  getTagsForSession,
  allTags,
  favorites,
  onToggleFavorite,
  onToggleTag,
  onDeleteSession,
  onResumeSession,
  onCopyResumeSession,
  terminal: propTerminal,
  piPath: propPiPath,
  customCommand: propCustomCommand,
  resumeCommand: propResumeCommand,
  isMobile,
  liveSessionIds,
  hideProjectInfo = false,
}: KanbanColumnProps) {
  const { t } = useTranslation()
  const { copyText } = useClipboard()
  const { setNodeRef, isOver } = useDroppable({ id })
  const scrollRef = useRef<HTMLDivElement>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    session: SessionInfo
    position: { x: number; y: number }
  } | null>(null)

  const handleContextMenu = (session: SessionInfo, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      session,
      position: { x: e.clientX, y: e.clientY },
    })
  }

  const isHex = tag?.color?.startsWith('#')
  const useVirtual = sessions.length > VIRTUALIZATION_THRESHOLD

  const liveCount = useMemo(
    () => sessions.filter(
      (s) => s.isLive || (liveSessionIds?.has(s.id) ?? false),
    ).length,
    [sessions, liveSessionIds],
  )

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
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="pb-2">
                  <KanbanCard
                    session={session}
                    tags={getTagsForSession(session.id)}
                    isSelected={selectedSession?.id === session.id}
                    onSelect={(rect, clickPoint) => onSelectSession(session, rect, clickPoint)}
                    onContextMenu={(e) => handleContextMenu(session, e)}
                    hideProjectInfo={hideProjectInfo}
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
      <div className="flex flex-col gap-2">
        {sessions.map(session => (
          <KanbanCard
            key={session.id}
            session={session}
            tags={getTagsForSession(session.id)}
            isSelected={selectedSession?.id === session.id}
            onSelect={(rect, clickPoint) => onSelectSession(session, rect, clickPoint)}
            onContextMenu={(e) => handleContextMenu(session, e)}
            hideProjectInfo={hideProjectInfo}
          />
        ))}
      </div>
    )
  }

  return (
    <div className={`flex flex-col flex-shrink-0 h-full overflow-hidden ${isMobile ? 'w-full' : 'w-64 min-w-[256px]'}`}>
      {/* Column Header - hidden on mobile (tabs handle this) */}
      {!isMobile && (
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
          {tag?.name || t('tags.kanban.untagged')}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-muted/50">
          {sessions.length}
        </span>
        {liveCount > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-green-500/10 text-green-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-[10px] font-medium tabular-nums">{liveCount}</span>
          </span>
        )}
      </div>
      )}

      {/* Column Content */}
      <div
        ref={setNodeRef}
        className={[
          'flex-1 min-h-0 rounded-lg border p-1.5 motion-color',
          'bg-muted/20 border-border/30',
          isOver ? 'border-primary/50 bg-primary/5' : '',
        ].filter(Boolean).join(' ')}
      >
        <div
          ref={scrollRef}
          className="h-full overflow-y-auto"
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

      {/* Context Menu */}
      {contextMenu && (
        <KanbanContextMenu
          session={contextMenu.session}
          tags={getTagsForSession(contextMenu.session.id)}
          allTags={allTags}
          favorites={favorites}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onOpenInTerminal={async () => {
            if (onResumeSession) {
              await onResumeSession(contextMenu.session)
              return
            }
            if (!isTauri()) return
            try {
              await openSessionInTerminalDirect(contextMenu.session, {
                terminal: propTerminal,
                customCommand: propCustomCommand,
                piPath: propPiPath,
                resumeCommand: propResumeCommand,
              })
            } catch (err) {
              console.error('Failed to open in terminal:', err)
            }
          }}
          onOpenInBrowser={async () => {
            if (!isTauri()) return
            try {
              await invoke('open_session_in_browser', { path: contextMenu.session.path })
            } catch (err) {
              console.error('Failed to open in browser:', err)
            }
          }}
          onToggleFavorite={() => {
            onToggleFavorite({
              type: 'session',
              id: contextMenu.session.id,
              name: contextMenu.session.name || contextMenu.session.first_message || 'Untitled',
              path: contextMenu.session.path,
            })
          }}
          onToggleTag={(tagId, assigned) => {
            onToggleTag(contextMenu.session.id, tagId, assigned)
          }}
          onCopyResume={
            onCopyResumeSession
              ? async () => {
                  await onCopyResumeSession(contextMenu.session)
                }
              : isTauri()
              ? () => {
                  void buildCopyResumeCommand(contextMenu.session, {
                    piPath: propPiPath,
                    resumeCommand: propResumeCommand,
                  }).then((command) => copyText(command).catch(console.error))
                }
              : undefined
          }
          onDelete={(anchorPoint) => {
            onDeleteSession?.(contextMenu.session, { anchorPoint })
            setContextMenu(null)
          }}
        />
      )}

    </div>
  )
}
