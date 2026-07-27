import type { RefObject } from 'react'
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SessionInfo } from '@/types'
import { MessageSquare, Calendar, Trash2, FolderOpen, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { DirectoryListSkeleton } from '@/components/ui/Skeleton'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import OpenInTerminalButton from '@/components/OpenInTerminalButton'
import { SessionBadge } from '@/components/session-viewer/SessionBadge'
import type { TerminalType } from '@/components/settings/types'
import { getPlatformDefaults } from '@/components/settings/types'
import { getSessionSourceSlug, getSessionSourceTag } from '@/utils/session'
import { getSessionListDisplayName } from '@/utils/sessionDisplay'
import { useSettings } from '@/hooks/useSettings'

interface SessionListByDirectoryProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
  onDeleteSession?: (session: SessionInfo) => void
  onResumeSession?: (session: SessionInfo) => void | Promise<void>
  loading: boolean
  terminal?: TerminalType
  piPath?: string
  customCommand?: string
  resumeCommand?: string
  getBadgeType?: (sessionId: string) => 'new' | 'updated' | null
  scrollParentRef?: RefObject<HTMLDivElement>
  liveSessionIds?: Set<string>
}

export default function SessionListByDirectory({
  sessions,
  selectedSession,
  onSelectSession,
  onDeleteSession,
  onResumeSession,
  loading,
  terminal = getPlatformDefaults().defaultTerminal,
  piPath,
  customCommand,
  resumeCommand,
  getBadgeType,
  scrollParentRef,
  liveSessionIds,
}: SessionListByDirectoryProps) {
  const { t } = useTranslation()
  const { getSessionSetting } = useSettings()
  const showAgentIconInBadge =
    getSessionSetting('showAgentIconInSessionBadge') !== false
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  const groupedSessions = sessions.reduce((acc, session) => {
    const cwd = session.cwd || t('common.unknown')
    if (!acc[cwd]) {
      acc[cwd] = []
    }
    acc[cwd].push(session)
    return acc
  }, {} as Record<string, SessionInfo[]>)

  const sortedDirs = Object.keys(groupedSessions).sort()

  for (const dir of sortedDirs) {
    groupedSessions[dir].sort((a, b) =>
      new Date(b.modified).getTime() - new Date(a.modified).getTime()
    )
  }

  useEffect(() => {
    setExpandedDirs(new Set(sortedDirs))
  }, [sortedDirs])

  const toggleDir = (dir: string) => {
    setExpandedDirs(prev => {
      const newSet = new Set(prev)
      if (newSet.has(dir)) {
        newSet.delete(dir)
      } else {
        newSet.add(dir)
      }
      return newSet
    })
  }

  const showDelayedLoading = useDelayedLoading(loading)

  if (showDelayedLoading) {
    return <DirectoryListSkeleton />
  }

  if (loading) {
    return <div className="flex-1 min-h-[120px]" aria-hidden="true" />
  }

  if (sessions.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-xs">{t('session.list.noSessions')}</p>
      </div>
    )
  }

  const flatRows = useMemo(() => {
    const rows: Array<
      | { type: 'dir'; dir: string; dirName: string; count: number; isExpanded: boolean }
      | { type: 'session'; dir: string; session: SessionInfo }
    > = []

    sortedDirs.forEach((dir) => {
      const dirSessions = groupedSessions[dir]
      const isExpanded = expandedDirs.has(dir)
      const dirName = getDirectoryName(dir, t)

      rows.push({
        type: 'dir',
        dir,
        dirName,
        count: dirSessions.length,
        isExpanded,
      })

      if (isExpanded) {
        dirSessions.forEach((session) => {
          rows.push({ type: 'session', dir, session })
        })
      }
    })

    return rows
  }, [expandedDirs, groupedSessions, sortedDirs, t])

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollParentRef?.current ?? null,
    estimateSize: (index) => (flatRows[index]?.type === 'dir' ? 36 : 64),
    overscan: 8,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  return (
    <div className="relative">
      <div
        className="relative w-full"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const row = flatRows[virtualRow.index]
          if (!row) return null

          if (row.type === 'dir') {
            return (
              <div
                key={`dir-${row.dir}`}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="border-b border-border/20"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <button
                  onClick={() => toggleDir(row.dir)}
                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-surface motion-color focus-ring text-left bg-background"
                >
                  {row.isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <div className="h-7 w-7 rounded-md bg-surface-dark border border-border/40 flex items-center justify-center">
                    <FolderOpen className="h-3.5 w-3.5 text-blue-400" />
                  </div>
                  <span className="text-xs font-medium flex-1 truncate">{row.dirName}</span>
                  <span className="px-2 py-0.5 rounded-md bg-surface border border-border/30 text-[11px] text-muted-foreground tabular-nums">
                    {row.count} {t('project.list.sessions', 'Session')}
                  </span>
                </button>
              </div>
            )
          }

          const session = row.session
          const sourceTag = getSessionSourceTag(session.path)
          const sourceSlug = getSessionSourceSlug(session.path)
          const isLive = session.isLive || (liveSessionIds?.has(session.id) ?? false)
          const displayName = getSessionListDisplayName(
            session,
            t('session.list.untitled'),
          )
          const hoverTitle = [
            displayName,
            `${t('session.tooltip.path')}: ${session.path}`,
            `${t('session.tooltip.created')}: ${new Date(session.created).toLocaleString()}`,
            `${t('session.tooltip.updated')}: ${new Date(session.modified).toLocaleString()}`,
            `${t('session.tooltip.messages')}: ${session.message_count}`,
          ].join('\n')
          return (
            <div
              key={`session-${session.id}`}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              onClick={() => onSelectSession(session)}
              title={hoverTitle}
              className={`px-3 py-2.5 cursor-pointer select-none motion-color group pl-5 border-b border-border/20 ${
                selectedSession?.id === session.id ? 'bg-surface' : 'hover:bg-surface'
              }`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="h-7 w-7 rounded-md bg-surface-dark border border-border/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isLive && (
                        <span
                          className="h-2 w-2 rounded-full bg-green-500 animate-pulse flex-shrink-0"
                          title="Live"
                        />
                      )}
                      {sourceTag && (
                        <SessionBadge
                          label={sourceTag}
                          tone="source"
                          sourceSlug={sourceSlug || undefined}
                          showIcon={showAgentIconInBadge}
                          className="text-[9px] sm:text-[10px]"
                        />
                      )}
                      <h3 className="font-medium text-xs truncate leading-tight flex-1">
                        {displayName}
                      </h3>
                      {getBadgeType && getBadgeType(session.id) && (
                        <SessionBadge type={getBadgeType(session.id)!} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground/80 tabular-nums">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {t('common.created')} {formatShortTime(session.created, t)}
                      </span>
                      <span className="text-border/60">·</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {t('common.updated')} {formatShortTime(session.modified, t)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                  <span className="px-2 py-0.5 rounded-md bg-surface border border-border/30 text-right">
                    {session.message_count} {t('session.list.messages')}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 motion-opacity">
                    <OpenInTerminalButton
                      session={session}
                      terminal={terminal}
                      piPath={piPath}
                      customCommand={customCommand}
                      resumeCommand={resumeCommand}
                      onResumeSession={onResumeSession}
                      size="sm"
                      variant="ghost"
                      onError={(error) => console.error('Failed to open in terminal:', error)}
                    />
                    {onDeleteSession && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteSession(session)
                        }}
                        className="p-1 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded motion-color motion-surface focus-ring"
                        title={t('common.deleteSession')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getDirectoryName(cwd: string, t: any): string {
  if (!cwd || cwd === 'Unknown') {
    return cwd || t('session.list.unknownDirectory')
  }

  const parts = cwd.split(/[\\/]/)
  const lastPart = parts[parts.length - 1]

  if (lastPart && lastPart.length > 0) {
    return lastPart
  }

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]} / ${parts[parts.length - 1]}`
  }

  return cwd
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
