import type { RefObject } from 'react'
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SessionInfo } from '../types'
import { MessageSquare, Calendar, Trash2, FolderOpen, ChevronDown, ChevronRight, Loader2, Search } from 'lucide-react'
import OpenInTerminalButton from './OpenInTerminalButton'
import { SessionBadge } from './SessionBadge'

interface SessionListByDirectoryProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
  onDeleteSession?: (session: SessionInfo) => void
  loading: boolean
  terminal?: 'iterm2' | 'terminal' | 'vscode' | 'custom'
  piPath?: string
  customCommand?: string
  getBadgeType?: (sessionId: string) => 'new' | 'updated' | null
  scrollParentRef?: RefObject<HTMLDivElement>
}

export default function SessionListByDirectory({
  sessions,
  selectedSession,
  onSelectSession,
  onDeleteSession,
  loading,
  terminal = 'iterm2',
  piPath,
  customCommand,
  getBadgeType,
  scrollParentRef,
}: SessionListByDirectoryProps) {
  const { t } = useTranslation()
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

  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
        <p className="text-xs">{t('session.list.loading')}</p>
      </div>
    )
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
                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[#222334] transition-colors text-left bg-background"
                >
                  {row.isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <div className="h-7 w-7 rounded-md bg-[#1f2130] border border-border/40 flex items-center justify-center">
                    <FolderOpen className="h-3.5 w-3.5 text-blue-400" />
                  </div>
                  <span className="text-xs font-medium flex-1 truncate">{row.dirName}</span>
                  <span className="px-2 py-0.5 rounded-md bg-[#222334] border border-border/30 text-[11px] text-muted-foreground tabular-nums">
                    {row.count} {t('project.list.sessions', '会话')}
                  </span>
                </button>
              </div>
            )
          }

          const session = row.session
          const hoverTitle = [
            session.name || session.first_message || t('session.list.untitled'),
            `路径: ${session.path}`,
            `创建: ${new Date(session.created).toLocaleString()}`,
            `更新: ${new Date(session.modified).toLocaleString()}`,
            `消息: ${session.message_count}`,
          ].join('\n')
          return (
            <div
              key={`session-${session.id}`}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              onClick={() => onSelectSession(session)}
              title={hoverTitle}
              className={`px-3 py-2.5 cursor-pointer transition-colors group pl-5 border-b border-border/20 ${
                selectedSession?.id === session.id ? 'bg-[#262738]' : 'hover:bg-[#222334]'
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
                  <div className="h-7 w-7 rounded-md bg-[#1f2130] border border-border/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-xs truncate leading-tight flex-1">
                        {session.name || session.first_message || t('session.list.untitled')}
                      </h3>
                    {/* Badge */}
                    {getBadgeType && getBadgeType(session.id) && (
                      <SessionBadge type={getBadgeType(session.id)!} />
                    )}
                  </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground/80 tabular-nums">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {t('common.created', '创建')} {formatShortTime(session.created)}
                      </span>
                      <span className="text-border/60">·</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {t('common.updated', '更新')} {formatShortTime(session.modified)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                  <span className="px-2 py-0.5 rounded-md bg-[#222334] border border-border/30 text-right">
                    {session.message_count} {t('session.list.messages')}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <OpenInTerminalButton
                      session={session}
                      terminal={terminal}
                      piPath={piPath}
                      customCommand={customCommand}
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
                        className="p-1 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded transition-all"
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
  if (!cwd || cwd === 'Unknown' || cwd === '未知') {
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

function formatShortTime(date: string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays < 30) return `${diffDays}天前`
  return `${Math.floor(diffDays / 30)}月前`
}
