import { useTranslation } from 'react-i18next'
import type { SessionInfo } from '../types'
import { MessageSquare, FileText, Trash2, Loader2, Search, FolderOpen, Clock, User, Bot } from 'lucide-react'
import OpenInBrowserButton from './OpenInBrowserButton'
import OpenInTerminalButton from './OpenInTerminalButton'

interface SessionListProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
  onDeleteSession?: (session: SessionInfo) => void
  loading: boolean
  searchQuery?: string
}

export default function SessionList({
  sessions,
  selectedSession,
  onSelectSession,
  onDeleteSession,
  loading,
}: SessionListProps) {
  const { t } = useTranslation()

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

  return (
    <div className="divide-y divide-border/20">
      {sessions.map((session) => (
        <div
          key={session.id}
          onClick={() => onSelectSession(session)}
          className={`px-4 py-3.5 cursor-pointer transition-all duration-200 group relative ${
            selectedSession?.id === session.id 
              ? 'bg-accent/80 border-l-2 border-primary' 
              : 'hover:bg-accent/50 border-l-2 border-transparent'
          }`}
        >
          {/* 卡片式布局 */}
          <div className="flex items-start gap-3">
            {/* 图标 */}
            <div className={`p-2 rounded-lg transition-colors ${
              selectedSession?.id === session.id 
                ? 'bg-primary/10 text-primary' 
                : 'bg-muted/50 text-muted-foreground group-hover:bg-primary/5 group-hover:text-primary/70'
            }`}>
              <MessageSquare className="h-4 w-4" />
            </div>

            {/* 内容区域 */}
            <div className="flex-1 min-w-0 space-y-2">
              {/* 标题行 */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-sm leading-tight line-clamp-2">
                  {session.name || session.first_message || t('session.list.untitled')}
                </h3>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {/* 在终端中打开按钮 */}
                  <OpenInTerminalButton
                    session={session}
                    size="sm"
                    variant="ghost"
                    onError={(error) => console.error('Failed to open in terminal:', error)}
                  />
                  {/* 在浏览器中打开按钮 */}
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

              {/* 消息预览 - 优先显示最后一条消息 */}
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

              {/* 目录信息 */}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                <FolderOpen className="h-3 w-3 flex-shrink-0" />
                <span className="truncate font-mono">
                  {formatDirectory(session.cwd) || t('session.list.unknownDirectory')}
                </span>
              </div>

              {/* 元信息行 */}
              <div className="flex items-center gap-3 text-[11px]">
                <span className={`flex items-center gap-1.5 ${
                  selectedSession?.id === session.id 
                    ? 'text-primary/80' 
                    : 'text-muted-foreground/70'
                }`}>
                  <Clock className="h-3 w-3" />
                  {formatShortTime(session.modified)}
                </span>
                <span className="text-border/50">•</span>
                <span className={`flex items-center gap-1.5 ${
                  selectedSession?.id === session.id 
                    ? 'text-primary/80' 
                    : 'text-muted-foreground/70'
                }`}>
                  <FileText className="h-3 w-3" />
                  {session.message_count} {t('session.list.messages')}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
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