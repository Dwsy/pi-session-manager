import { useState } from 'react'
import { Clock, Folder, MessageCircle, MessageCircleReply } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import DashboardCardShell from './DashboardCardShell'
import type { SessionInfo } from '@/types'
import { getPathBasename } from '@/utils/path'

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

  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
    .slice(0, limit)

  const getProjectName = (cwd: string) =>
    getPathBasename(cwd) || t('common.unknown')

  const getActivityLabel = (messageCount: number) => {
    if (messageCount > 100) return t('dashboard.activityLevels.high')
    if (messageCount > 50) return t('dashboard.activityLevels.medium')
    return t('dashboard.activityLevels.low')
  }

  const getSessionDisplayTitle = (session: SessionInfo) => {
    if (
      session.name &&
      session.name.trim() !== '' &&
      session.name !== t('common.untitled')
    ) {
      return session.name
    }

    const message = showFirstMessage ? session.first_message : session.last_message
    if (message?.trim()) {
      const trimmed = message.trim()
      return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed
    }
    return t('common.untitled')
  }

  return (
    <DashboardCardShell className="p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{displayTitle}</span>
          <span className="font-mono text-[10px] font-normal text-muted-foreground">
            {recentSessions.length}
          </span>
        </h3>
        <button
          type="button"
          onClick={() => setShowFirstMessage((current) => !current)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border/60 text-muted-foreground motion-surface hover:bg-muted/30 hover:text-foreground focus-ring"
          title={
            showFirstMessage
              ? t('dashboard.recentSessions.showLastMessage', 'Show last message')
              : t('dashboard.recentSessions.showFirstMessage', 'Show first message')
          }
        >
          {showFirstMessage ? (
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <MessageCircleReply className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {recentSessions.length === 0 ? (
        <p className="border-t border-border/50 py-8 text-center text-xs text-muted-foreground">
          {t('dashboard.noRecentSessions')}
        </p>
      ) : (
        <div className="border-t border-border/50">
          {recentSessions.map((session) => {
            const displayName = getSessionDisplayTitle(session)
            const timeAgo = formatDistanceToNow(new Date(session.modified), {
              addSuffix: true,
            })

            const rowClassName =
              'flex w-full items-start gap-3 border-b border-border/40 px-1 py-2.5 text-left last:border-b-0'
            const rowContent = (
              <>
                <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      liveSessionIds?.has(session.id)
                        ? 'bg-success'
                        : 'bg-muted-foreground/45'
                    }`}
                    aria-label={
                      liveSessionIds?.has(session.id)
                        ? t('session.online', 'Online')
                        : undefined
                    }
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground" title={displayName}>
                    {displayName}
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Folder className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{getProjectName(session.cwd)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="shrink-0 tabular-nums">
                      {session.message_count} {t('common.messages', 'messages')}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-right text-[10px] text-muted-foreground">
                  <span className="block whitespace-nowrap">{timeAgo}</span>
                  <span className="mt-1 block text-[9px] uppercase tracking-[0.08em]">
                    {getActivityLabel(session.message_count)}
                  </span>
                </span>
              </>
            )

            return onSessionSelect ? (
              <button
                key={session.id}
                type="button"
                onClick={() => onSessionSelect(session)}
                className={`${rowClassName} focus-ring hover:bg-muted/30`}
              >
                {rowContent}
              </button>
            ) : (
              <div key={session.id} className={rowClassName}>
                {rowContent}
              </div>
            )
          })}
        </div>
      )}
    </DashboardCardShell>
  )
}
