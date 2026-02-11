import { MessageSquare, User, Bot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionStats } from '../types'

interface MessageDistributionProps {
  stats: SessionStats
  title?: string
}

export default function MessageDistribution({ stats, title }: MessageDistributionProps) {
  const { t } = useTranslation()
  const displayTitle = title || t('dashboard.messageDistribution.title')

  const userPercent = stats.total_messages > 0
    ? (stats.user_messages / stats.total_messages) * 100
    : 0
  const assistantPercent = stats.total_messages > 0
    ? (stats.assistant_messages / stats.total_messages) * 100
    : 0

  const totalMessages = stats.total_messages.toLocaleString()

  return (
    <div className="glass-card rounded-xl p-5 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-info/5 via-transparent to-success/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium flex items-center gap-2 text-foreground">
            <div className="p-1.5 rounded-lg bg-info/10">
              <MessageSquare className="h-4 w-4 text-info" />
            </div>
            {displayTitle}
          </h3>
          <div className="text-xs text-muted-foreground">
            {t('dashboard.messageDistribution.total')}: <span className="text-foreground font-medium">{totalMessages}</span>
          </div>
        </div>

        <div className="relative h-10 bg-background/80 rounded-xl overflow-hidden mb-4 inner-shadow">
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-info to-[#6bb8ff] transition-all duration-500 flex items-center justify-center shadow-lg"
            style={{ width: `${userPercent}%` }}
          >
            <span className="text-xs font-bold text-white drop-shadow-md">
              {userPercent.toFixed(1)}%
            </span>
          </div>
          <div
            className="absolute right-0 top-0 h-full bg-gradient-to-r from-success to-[#a3ff9e] transition-all duration-500 flex items-center justify-center shadow-lg"
            style={{ width: `${assistantPercent}%` }}
          >
            <span className="text-xs font-bold text-white drop-shadow-md">
              {assistantPercent.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-background/60 rounded-xl p-3 border border-foreground/5 transition-all duration-300 hover:bg-background/80 hover:border-info/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-info/20 rounded-lg">
                <User className="h-3 w-3 text-info" />
              </div>
              <span className="text-xs text-muted-foreground">{t('dashboard.messageDistribution.userMessages')}</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-gradient">{stats.user_messages.toLocaleString()}</span>
              <span className="text-xs text-info font-medium">{userPercent.toFixed(1)}%</span>
            </div>
          </div>

          <div className="bg-background/60 rounded-xl p-3 border border-foreground/5 transition-all duration-300 hover:bg-background/80 hover:border-success/20">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-success/20 rounded-lg">
                <Bot className="h-3 w-3 text-success" />
              </div>
              <span className="text-xs text-muted-foreground">{t('dashboard.messageDistribution.assistantMessages')}</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-xl font-bold text-gradient">{stats.assistant_messages.toLocaleString()}</span>
              <span className="text-xs text-success font-medium">{assistantPercent.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-foreground/5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('dashboard.messageDistribution.userAssistantRatio')}</span>
          <span className="text-sm font-medium text-foreground bg-background/60 px-3 py-1 rounded-lg">
            1 : {(stats.assistant_messages / Math.max(stats.user_messages, 1)).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}