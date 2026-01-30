import { Clock, MessageSquare, Folder, Zap } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import type { SessionInfo } from '../../types'

interface RecentSessionsProps {
  sessions: SessionInfo[]
  title?: string
  limit?: number
}

export default function RecentSessions({ sessions, title, limit = 5 }: RecentSessionsProps) {
  const { t } = useTranslation()
  const displayTitle = title || t('dashboard.recentSessions.title')

  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
    .slice(0, limit)

  const getProjectName = (cwd: string) => {
    const parts = cwd.split('/')
    return parts[parts.length - 1] || t('common.unknown')
  }

  const getActivityLevel = (messageCount: number) => {
    if (messageCount > 100) return { level: 'high', color: '#7ee787', label: t('dashboard.activityLevels.high') }
    if (messageCount > 50) return { level: 'medium', color: '#ffa657', label: t('dashboard.activityLevels.medium') }
    return { level: 'low', color: '#6a6f85', label: t('dashboard.activityLevels.low') }
  }

  if (recentSessions.length === 0) {
    return (
      <div className="bg-[#2c2d3b] rounded-xl p-5">
        <h3 className="text-sm font-medium flex items-center gap-2 text-white mb-4">
          <Clock className="h-4 w-4 text-[#6a6f85]" />
          {displayTitle}
        </h3>
        <div className="text-center py-8 text-[#6a6f85]">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t('dashboard.noRecentSessions')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#2c2d3b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2 text-white">
          <Clock className="h-4 w-4 text-[#6a6f85]" />
          {displayTitle}
        </h3>
        <div className="text-xs text-[#6a6f85]">
          {recentSessions.length} {t('common.sessions')}
        </div>
      </div>

      <div className="space-y-3">
        {recentSessions.map((session, index) => {
          const activity = getActivityLevel(session.message_count)
          const timeAgo = formatDistanceToNow(new Date(session.modified), { addSuffix: true })

          return (
            <div
              key={session.id}
              className="group flex items-center gap-3 p-3 bg-[#1a1b26] rounded-lg hover:bg-[#252638] transition-all cursor-pointer"
            >
              <div className="flex-shrink-0 w-6 h-6 rounded-md bg-[#569cd6]/10 flex items-center justify-center">
                <span className="text-[10px] font-bold text-[#569cd6]">{index + 1}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white truncate">
                    {session.name || t('common.untitled')}
                  </span>
                  {activity.level !== 'low' && (
                    <Zap className="h-3 w-3" style={{ color: activity.color }} />
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-[#6a6f85]">
                  <span className="flex items-center gap-1">
                    <Folder className="h-3 w-3" />
                    {getProjectName(session.cwd)}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    {session.message_count} {t('dashboard.msgs')}
                  </span>
                </div>
              </div>

              <div className="flex-shrink-0 text-right">
                <div className="text-[10px] text-[#6a6f85]">{timeAgo}</div>
                <div
                  className="text-[9px] px-1.5 py-0.5 rounded mt-1 inline-block"
                  style={{
                    backgroundColor: `${activity.color}20`,
                    color: activity.color,
                  }}
                >
                  {activity.label}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}