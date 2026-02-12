import { useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SessionInfo, FavoriteItem, Tag } from '../types'
import { Trash2, Search, Star, Clock, Tags } from 'lucide-react'
import { SessionListSkeleton } from './Skeleton'
import OpenInBrowserButton from './OpenInBrowserButton'
import OpenInTerminalButton from './OpenInTerminalButton'
import { SessionBadge } from './SessionBadge'
import TagBadge from './TagBadge'
import TagPicker from './TagPicker'
import SessionContextMenu from './SessionContextMenu'
import type { TerminalType } from './settings/types'
import { getPlatformDefaults } from './settings/types'
import { invoke, isTauri } from '../transport'

interface SessionListProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
  onDeleteSession?: (session: SessionInfo) => void
  loading: boolean
  searchQuery?: string
  getBadgeType?: (sessionId: string) => 'new' | 'updated' | null
  terminal?: TerminalType
  piPath?: string
  customCommand?: string
  scrollParentRef?: RefObject<HTMLDivElement>
  favorites?: FavoriteItem[]
  onToggleFavorite?: (item: Omit<FavoriteItem, 'addedAt'>) => void
  showDirectory?: boolean
  tags?: Tag[]
  getTagsForSession?: (sessionId: string) => Tag[]
  onToggleTag?: (sessionId: string, tagId: string, currentlyAssigned: boolean) => void
  onCreateTag?: (name: string, color: string) => void
}

export default function SessionList({
  sessions,
  selectedSession,
  onSelectSession,
  onDeleteSession,
  loading,
  getBadgeType,
  terminal = getPlatformDefaults().defaultTerminal,
  piPath,
  customCommand,
  scrollParentRef,
  favorites = [],
  onToggleFavorite,
  showDirectory = true,
  tags = [],
  getTagsForSession,
  onToggleTag,
  onCreateTag,
}: SessionListProps) {
  const { t } = useTranslation()
  const [tagPickerSessionId, setTagPickerSessionId] = useState<string | null>(null)
  const [tagPickerAnchor, setTagPickerAnchor] = useState<DOMRect | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => scrollParentRef?.current ?? null,
    estimateSize: () => 66,
    overscan: 8,
  })

  if (loading) {
    return <SessionListSkeleton showDirectory={showDirectory} />
  }

  if (sessions.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50 px-8">
        <Search className="h-8 w-8 mb-3 opacity-40" />
        <span className="text-[11px] text-center">{t('session.list.empty')}</span>
      </div>
    )
  }

  const virtualItems = rowVirtualizer.getVirtualItems()

  return (
    <div className="relative">
      <div
        className="relative w-full"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const session = sessions[virtualRow.index]
          if (!session) return null

          const isFavorite = favorites.some(f => f.type === 'session' && f.id === session.id)
          const updatedLabel = formatShortTime(session.modified, t)
          const isSelected = selectedSession?.id === session.id
          const hasPreview = session.last_message || (session.first_message && !session.name)

          return (
            <div
              key={session.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              onClick={() => onSelectSession(session)}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY, sessionId: session.id })
              }}
              className={`relative px-3 py-2 cursor-pointer transition-all group border-b border-border/10 border-l-2 ${
                isSelected 
                  ? 'bg-gradient-to-r from-blue-500/5 to-transparent border-l-blue-500' 
                  : 'border-l-transparent hover:bg-background'
              }`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <h3 className="font-medium text-[11px] text-foreground leading-tight line-clamp-1 flex-1 min-w-0">
                  {session.name || session.first_message || t('session.list.untitled')}
                </h3>
                {getTagsForSession && getTagsForSession(session.id).length > 0 && (
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {getTagsForSession(session.id).map(tag => (
                      <TagBadge key={tag.id} tag={tag} compact />
                    ))}
                  </div>
                )}
                {getBadgeType && getBadgeType(session.id) && (
                  <div className="flex-shrink-0">
                    <SessionBadge type={getBadgeType(session.id)!} />
                  </div>
                )}
                <div className="flex items-center gap-2 text-[9px] text-muted-foreground flex-shrink-0">
                  <span className="px-1.5 py-0.5 rounded bg-muted/30 tabular-nums">
                    {session.message_count}
                  </span>
                  <div className="flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    <span className="whitespace-nowrap">{updatedLabel}</span>
                  </div>
                </div>
              </div>

              {hasPreview && (
                <p className="text-[10px] text-muted-foreground line-clamp-1 leading-relaxed mb-1.5">
                  {session.last_message || session.first_message}
                </p>
              )}

              <div className="flex items-center gap-2">
                {showDirectory && (
                  <span className="text-[9px] text-muted-foreground/70 font-mono truncate flex-1 min-w-0">
                    {formatDirectory(session.cwd) || t('session.list.unknownDirectory')}
                  </span>
                )}
                {!showDirectory && <span className="flex-1" />}

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {onToggleFavorite && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFavorite({
                          type: 'session',
                          id: session.id,
                          name: session.name || session.first_message || t('session.list.untitled'),
                          path: session.path,
                        })
                      }}
                      className={`p-1 rounded transition-all ${
                        isFavorite ? 'text-yellow-400' : 'text-muted-foreground/60 hover:text-yellow-400'
                      }`}
                      title={isFavorite ? t('favorites.remove') : t('favorites.add')}
                    >
                      <Star className={`h-3 w-3 ${isFavorite ? 'fill-current' : ''}`} />
                    </button>
                  )}
                  {onToggleTag && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setTagPickerSessionId(prev => prev === session.id ? null : session.id)
                        setTagPickerAnchor(rect)
                      }}
                      className="p-1 text-muted-foreground/60 hover:text-blue-400 rounded transition-all"
                      title={t('tags.assign')}
                    >
                      <Tags className="h-3 w-3" />
                    </button>
                  )}
                  <OpenInTerminalButton
                    session={session}
                    terminal={terminal}
                    piPath={piPath}
                    customCommand={customCommand}
                    size="sm"
                    variant="ghost"
                    onError={(error) => console.error('Failed to open in terminal:', error)}
                  />
                  <OpenInBrowserButton
                    session={session}
                    size="sm"
                    variant="ghost"
                    onError={(error) => console.error('Failed to open in browser:', error)}
                  />
                  {onDeleteSession && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteSession(session)
                      }}
                      className="p-1 text-muted-foreground/60 hover:text-red-500 rounded transition-all"
                      title={t('common.deleteSession')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {tagPickerSessionId && onToggleTag && (
        <TagPicker
          tags={tags}
          selectedTagIds={getTagsForSession ? getTagsForSession(tagPickerSessionId).map(tg => tg.id) : []}
          onToggle={(tagId) => {
            const assigned = getTagsForSession ? getTagsForSession(tagPickerSessionId).some(tg => tg.id === tagId) : false
            onToggleTag(tagPickerSessionId, tagId, assigned)
          }}
          onCreateTag={onCreateTag}
          anchorRect={tagPickerAnchor}
          onClose={() => setTagPickerSessionId(null)}
        />
      )}

      {contextMenu && onToggleTag && (() => {
        const ctxSession = sessions.find(s => s.id === contextMenu.sessionId)
        if (!ctxSession) return null
        const isFav = favorites.some(f => f.type === 'session' && f.id === ctxSession.id)
        return (
          <SessionContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            sessionId={contextMenu.sessionId}
            tags={tags}
            sessionTagIds={getTagsForSession ? getTagsForSession(contextMenu.sessionId).map(tg => tg.id) : []}
            onToggleTag={(tagId, assigned) => onToggleTag(contextMenu.sessionId, tagId, assigned)}
            onOpenTerminal={isTauri() ? () => {
              invoke('open_session_in_terminal', {
                path: ctxSession.path, cwd: ctxSession.cwd,
                terminal: terminal === 'custom' ? customCommand : terminal,
                pi_path: piPath || null,
              }).catch(console.error)
            } : undefined}
            onOpenBrowser={isTauri() ? () => {
              invoke('open_session_in_browser', { path: ctxSession.path }).catch(console.error)
            } : undefined}
            onToggleFavorite={onToggleFavorite ? () => {
              onToggleFavorite({
                type: 'session', id: ctxSession.id,
                name: ctxSession.name || ctxSession.first_message || 'Untitled',
                path: ctxSession.path,
              })
            } : undefined}
            isFavorite={isFav}
            onDelete={onDeleteSession ? () => onDeleteSession(ctxSession) : undefined}
            onClose={() => setContextMenu(null)}
          />
        )
      })()}
    </div>
  )
}

function formatShortTime(date: string, t: TFunction): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t('common.time.justNow')
  if (diffMins < 60) return t('common.time.minutesAgo', { count: diffMins })
  if (diffHours < 24) return t('common.time.hoursAgo', { count: diffHours })
  if (diffDays < 30) return t('common.time.daysAgo', { count: diffDays })
  return t('common.time.monthsAgo', { count: Math.floor(diffDays / 30) })
}

function formatDirectory(path: string): string {
  if (!path) return ''
  
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 2) return path
  
  return '.../' + parts.slice(-2).join('/')
}