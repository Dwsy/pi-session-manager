import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { SessionInfo } from '../types'
import { MessageSquare, Trash2, Loader2, Search, FolderOpen, User, Bot } from 'lucide-react'
import OpenInBrowserButton from './OpenInBrowserButton'
import OpenInTerminalButton from './OpenInTerminalButton'
import { SessionBadge } from './SessionBadge'

interface SessionListProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
  onDeleteSession?: (session: SessionInfo) => void
  loading: boolean
  searchQuery?: string
  getBadgeType?: (sessionId: string) => 'new' | 'updated' | null
  terminal?: 'iterm2' | 'terminal' | 'vscode' | 'custom'
  piPath?: string
  customCommand?: string
  scrollParentRef?: RefObject<HTMLDivElement>
}

export default function SessionList({
  sessions,
  selectedSession,
  onSelectSession,
  onDeleteSession,
  loading,
  getBadgeType,
  terminal = 'iterm2',
  piPath,
  customCommand,
  scrollParentRef,
}: SessionListProps) {
  const { t } = useTranslation()
  const rowVirtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => scrollParentRef?.current ?? null,
    estimateSize: () => 96,
    overscan: 8,
  })

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
        <p className="text-xs">{t('session.list.empty')}</p>
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

          const createdLabel = formatShortTime(session.created)
          const updatedLabel = formatShortTime(session.modified)
          const hoverTitle = [
            session.name || session.first_message || t('session.list.untitled'),
            `路径: ${session.path}`,
            `创建: ${new Date(session.created).toLocaleString()}`,
            `更新: ${new Date(session.modified).toLocaleString()}`,
            `消息: ${session.message_count}`,
          ].join('\n')

          return (
            <div
              key={session.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              onClick={() => onSelectSession(session)}
              title={hoverTitle}
              className={`px-3 py-3 cursor-pointer transition-colors group border-b border-border/20 ${
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
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-[#1f2130] border border-border/40 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="h-4 w-4 text-blue-400" />
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <h3 className="font-semibold text-xs leading-tight line-clamp-2 flex-1 min-w-0">
                        {session.name || session.first_message || t('session.list.untitled')}
                      </h3>
                      {getBadgeType && getBadgeType(session.id) && (
                        <div className="flex-shrink-0 mt-0.5">
                          <SessionBadge type={getBadgeType(session.id)!} />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
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
                          className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
                          title={t('common.deleteSession')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {session.last_message ? (
                    <div className="flex items-start gap-2">
                      {session.last_message_role === 'user' ? (
                        <User className="h-3 w-3 text-blue-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <Bot className="h-3 w-3 text-green-500 flex-shrink-0 mt-0.5" />
                      )}
                      <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">
                        {session.last_message}
                      </p>
                    </div>
                  ) : session.first_message && !session.name ? (
                    <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed">
                      {session.first_message}
                    </p>
                  ) : null}

                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                    <FolderOpen className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate font-mono">
                      {formatDirectory(session.cwd) || t('session.list.unknownDirectory')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80">
                    <span className="px-2 py-0.5 rounded-md bg-[#222334] border border-border/30 whitespace-nowrap">
                      {session.message_count} {t('session.list.messages')}
                    </span>
                    <span className="text-border/60">·</span>
                    <span className="whitespace-nowrap">{t('common.created', '创建')} {createdLabel}</span>
                    <span className="text-border/60">·</span>
                    <span className="whitespace-nowrap">{t('common.updated', '更新')} {updatedLabel}</span>
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

function formatDirectory(path: string): string {
  if (!path) return ''
  
  // 提取最后两级目录
  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 2) return path
  
  return '.../' + parts.slice(-2).join('/')
}
