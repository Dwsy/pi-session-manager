import { useMemo, useState } from 'react'
import { Activity, Clock, Folder, Layers3, MessageCircle, MessageCircleReply } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import DashboardCardShell from './DashboardCardShell'
import type { SessionInfo } from '@/types'
import { getPathBasename } from '@/utils/path'

type SessionView = 'recent' | 'deep' | 'active'

interface RecentSessionsProps {
  sessions: SessionInfo[]
  title?: string
  limit?: number
  onSessionSelect?: (session: SessionInfo) => void
  liveSessionIds?: Set<string>
}

export default function RecentSessions({
  sessions,
  title,
  limit = 5,
  onSessionSelect,
  liveSessionIds,
}: RecentSessionsProps) {
  const { t } = useTranslation()
  const displayTitle = title || t('dashboard.recentSessions.title')
  const [showFirstMessage, setShowFirstMessage] = useState(true)
  const [view, setView] = useState<SessionView>('recent')

  const displayedSessions = useMemo(() => {
    const copy = [...sessions]
    if (view === 'deep') {
      copy.sort((left, right) => right.message_count - left.message_count || new Date(right.modified).getTime() - new Date(left.modified).getTime())
    } else if (view === 'active') {
      copy.sort((left, right) => {
        const leftLive = left.isLive || liveSessionIds?.has(left.id) ? 1 : 0
        const rightLive = right.isLive || liveSessionIds?.has(right.id) ? 1 : 0
        if (rightLive !== leftLive) return rightLive - leftLive
        const recency = new Date(right.modified).getTime() - new Date(left.modified).getTime()
        return recency || right.message_count - left.message_count
      })
    } else {
      copy.sort((left, right) => new Date(right.modified).getTime() - new Date(left.modified).getTime())
    }
    return copy.slice(0, limit)
  }, [sessions, view, limit, liveSessionIds])

  const getProjectName = (cwd: string) => getPathBasename(cwd) || t('common.unknown')

  const getSessionDisplayTitle = (session: SessionInfo) => {
    if (session.name?.trim() && session.name !== t('common.untitled')) return session.name
    const message = showFirstMessage ? session.first_message : session.last_message
    if (!message?.trim()) return t('common.untitled')
    const trimmed = message.trim()
    return trimmed.length > 68 ? `${trimmed.slice(0, 68)}…` : trimmed
  }

  const viewOptions: Array<{ value: SessionView; label: string; icon: typeof Clock }> = [
    { value: 'recent', label: t('dashboard.recentSessions.recent', 'Recent'), icon: Clock },
    { value: 'deep', label: t('dashboard.recentSessions.deep', 'Deep'), icon: Layers3 },
    { value: 'active', label: t('dashboard.recentSessions.active', 'Active'), icon: Activity },
  ]

  return (
    <DashboardCardShell className="p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{displayTitle}</span>
          <span className="font-mono text-[10px] font-normal text-muted-foreground">{displayedSessions.length}</span>
        </h3>
        <div className="flex items-center gap-1">
          <div className="flex rounded border border-border/60 p-0.5" role="group" aria-label={t('dashboard.recentSessions.sortMode', 'Session insight mode')}>
            {viewOptions.map((option) => {
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setView(option.value)}
                  aria-pressed={view === option.value}
                  className={`focus-ring flex h-6 items-center gap-1 rounded-sm px-1.5 text-[9px] ${view === option.value ? 'theme-accent-bg-soft theme-accent-ring theme-accent-fg font-semibold' : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'}`}
                >
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setShowFirstMessage((current) => !current)}
            className={`focus-ring flex h-7 w-7 shrink-0 items-center justify-center rounded border ${!showFirstMessage ? 'theme-accent-bg-soft theme-accent-ring theme-accent-fg border-transparent' : 'border-border/60 text-muted-foreground hover:bg-muted/30 hover:text-foreground'}`}
            title={showFirstMessage
              ? t('dashboard.recentSessions.showLastMessage', 'Show last message')
              : t('dashboard.recentSessions.showFirstMessage', 'Show first message')}
            aria-pressed={!showFirstMessage}
          >
            {showFirstMessage ? <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> : <MessageCircleReply className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {displayedSessions.length === 0 ? (
        <p className="border-t border-border/50 py-8 text-center text-xs text-muted-foreground">{t('dashboard.noRecentSessions')}</p>
      ) : (
        <div className="border-t border-border/50">
          {displayedSessions.map((session) => {
            const displayName = getSessionDisplayTitle(session)
            const timeAgo = formatDistanceToNow(new Date(session.modified), { addSuffix: true })
            const live = session.isLive || liveSessionIds?.has(session.id)
            const rowContent = (
              <>
                <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
                  <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-success' : 'bg-muted-foreground/45'}`} aria-label={live ? t('session.online', 'Online') : undefined} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground" title={displayName}>{displayName}</span>
                  <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Folder className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{getProjectName(session.cwd)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="shrink-0 tabular-nums">{session.message_count} {t('common.messages', 'messages')}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right text-[10px] text-muted-foreground">
                  <span className="block whitespace-nowrap">{timeAgo}</span>
                  <span className="mt-1 block tabular-nums">{view === 'deep' ? `#${displayedSessions.indexOf(session) + 1}` : live ? t('dashboard.recentSessions.live', 'live') : ''}</span>
                </span>
              </>
            )
            const rowClassName = 'flex w-full items-start gap-3 border-b border-border/40 px-1 py-2.5 text-left last:border-b-0'
            return onSessionSelect ? (
              <button key={session.id} type="button" onClick={() => onSessionSelect(session)} className={`${rowClassName} focus-ring hover:bg-muted/30`}>{rowContent}</button>
            ) : (
              <div key={session.id} className={rowClassName}>{rowContent}</div>
            )
          })}
        </div>
      )}
    </DashboardCardShell>
  )
}
