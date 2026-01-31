import { useState } from 'react'
import { Clock, MessageSquare, Folder, Zap, MessageCircle, MessageCircleReply } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import type { SessionInfo } from '../../types'

interface RecentSessionsProps {
  sessions: SessionInfo[]
  title?: string
  limit?: number
  onSessionSelect?: (session: SessionInfo) => void
}

export default function RecentSessions({ sessions, title, limit = 5, onSessionSelect }: RecentSessionsProps) {
  const { t } = useTranslation()
  const displayTitle = title || t('dashboard.recentSessions.title')
  const [showFirstMessage, setShowFirstMessage] = useState(true)

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

  // Get display title for session - use first or last message based on toggle
  const getSessionDisplayTitle = (session: SessionInfo) => {
    if (session.name && session.name.trim() !== '' && session.name !== t('common.untitled')) {
      return session.name
    }
    
    // Use first or last message based on toggle
    const message = showFirstMessage ? session.first_message : session.last_message
    
    if (message && message.trim() !== '') {
      const msg = message.trim()
      return msg.length > 45 ? msg.substring(0, 45) + '...' : msg
    }
    return t('common.untitled')
  }

  return (
    <div className="glass-card rounded-lg p-3 relative overflow-hidden group">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#569cd6]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium flex items-center gap-1.5 text-white">
            <div className="p-1 rounded bg-[#569cd6]/10">
              <Clock className="h-3 w-3 text-[#569cd6]" />
            </div>
            {displayTitle}
          </h3>
          <div className="flex items-center gap-1">
            <div className="text-[10px] text-[#6a6f85] bg-[#1a1b26]/60 px-2 py-0.5 rounded">
              {recentSessions.length} {t('common.sessions')}
            </div>
            {/* Toggle button for first/last message */}
            <button
              onClick={() => setShowFirstMessage(!showFirstMessage)}
              className="p-1 rounded bg-[#1a1b26]/60 hover:bg-[#1a1b26]/90 transition-all duration-200 group/toggle"
              title={showFirstMessage ? 'Show last message' : 'Show first message'}
            >
              {showFirstMessage ? (
                <MessageCircle className="h-3 w-3 text-[#569cd6] group-hover/toggle:text-[#7ee787] transition-colors" />
              ) : (
                <MessageCircleReply className="h-3 w-3 text-[#7ee787] group-hover/toggle:text-[#569cd6] transition-colors" />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          {recentSessions.map((session, index) => {
            const activity = getActivityLevel(session.message_count)
            const timeAgo = formatDistanceToNow(new Date(session.modified), { addSuffix: true })
            const displayName = getSessionDisplayTitle(session)

            return (
              <div
                key={session.id}
                onClick={() => onSessionSelect?.(session)}
                className="group/item flex items-center gap-2 p-2 bg-[#1a1b26]/60 rounded-lg border border-white/5 hover:bg-[#1a1b26]/90 hover:border-[#569cd6]/20 transition-all duration-300 cursor-pointer relative overflow-hidden"
              >
                {/* Hover glow effect */}
                <div
                  className="absolute inset-0 opacity-0 group-hover/item:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: `linear-gradient(90deg, ${activity.color}08 0%, transparent 50%)`
                  }}
                />

                <div className="flex-shrink-0 w-5 h-5 rounded bg-[#569cd6]/10 flex items-center justify-center relative z-10">
                  <span className="text-[9px] font-bold text-[#569cd6]">{index + 1}</span>
                </div>

                <div className="flex-1 min-w-0 relative z-10">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-medium text-white truncate" title={displayName}>
                      {displayName}
                    </span>
                    {activity.level !== 'low' && (
                      <Zap className="h-2.5 w-2.5 flex-shrink-0 transition-transform duration-300 group-hover/item:scale-110" style={{ color: activity.color }} />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] text-[#6a6f85]">
                    <span className="flex items-center gap-0.5">
                      <Folder className="h-2.5 w-2.5" />
                      {getProjectName(session.cwd)}
                    </span>
                    <span className="text-[#4a4f65]">•</span>
                    <span className="flex items-center gap-0.5">
                      <MessageSquare className="h-2.5 w-2.5" />
                      {session.message_count}
                    </span>
                  </div>
                </div>

                <div className="flex-shrink-0 text-right relative z-10">
                  <div className="text-[9px] text-[#6a6f85]">{timeAgo}</div>
                  <div
                    className="text-[8px] px-1.5 py-0.5 rounded mt-0.5 inline-block font-medium backdrop-blur-sm"
                    style={{
                      backgroundColor: `${activity.color}15`,
                      color: activity.color,
                      border: `1px solid ${activity.color}25`
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
    </div>
  )
}