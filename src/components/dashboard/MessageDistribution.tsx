import { Bot, MessageSquare, User, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import DashboardCardShell from './DashboardCardShell'
import type { DashboardTimeGranularity } from './dashboardTimeRange'
import type { SessionStats } from '@/types'

interface MessageDistributionProps {
  stats: SessionStats
  title?: string
  onClick?: () => void
  granularity?: DashboardTimeGranularity
  rangeLabel?: string
}

export default function MessageDistribution({ stats, title, onClick, granularity, rangeLabel }: MessageDistributionProps) {
  const { t } = useTranslation()
  const isSingleDay = granularity === 'day'
  const displayTitle = title || (isSingleDay
    ? t('dashboard.messageDistribution.dayTitle', 'Daily message distribution')
    : t('dashboard.messageDistribution.title', 'Message Distribution'))
  const userPercent = stats.total_messages > 0 ? (stats.user_messages / stats.total_messages) * 100 : 0
  const assistantPercent = stats.total_messages > 0 ? (stats.assistant_messages / stats.total_messages) * 100 : 0
  const ratio = stats.assistant_messages / Math.max(stats.user_messages, 1)

  const content = (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <span className="rounded bg-info/10 p-1"><MessageSquare className="h-3 w-3 text-info" aria-hidden="true" /></span>
          {displayTitle}
        </h3>
        <div className="text-right text-[10px] text-muted-foreground">
          {isSingleDay && rangeLabel ? <span className="block font-medium text-foreground">{rangeLabel}</span> : null}
          <span>{t('dashboard.messageDistribution.total', 'Total')}: <strong className="font-medium text-foreground">{stats.total_messages.toLocaleString()}</strong></span>
        </div>
      </div>

      {isSingleDay ? (
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded border border-border bg-border/60 sm:grid-cols-3">
          <DistributionMetric icon={MessageSquare} label={t('dashboard.messageDistribution.total', 'Total')} value={stats.total_messages.toLocaleString()} detail={t('dashboard.dayView.messages', 'Messages')} />
          <DistributionMetric icon={User} label={t('dashboard.messageDistribution.user', 'User')} value={stats.user_messages.toLocaleString()} detail={`${userPercent.toFixed(0)}%`} />
          <DistributionMetric icon={Bot} label={t('dashboard.messageDistribution.assistant', 'Assistant')} value={stats.assistant_messages.toLocaleString()} detail={`${assistantPercent.toFixed(0)}%`} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <DistributionMetric icon={User} label={t('dashboard.messageDistribution.user', 'User')} value={stats.user_messages.toLocaleString()} detail={`${userPercent.toFixed(0)}%`} bordered />
          <DistributionMetric icon={Bot} label={t('dashboard.messageDistribution.assistant', 'Assistant')} value={stats.assistant_messages.toLocaleString()} detail={`${assistantPercent.toFixed(0)}%`} bordered />
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-foreground/5 pt-2.5">
        <span className="text-[10px] text-muted-foreground">{t('dashboard.messageDistribution.userAssistantRatio', 'User/Assistant Ratio')}</span>
        <span className="rounded border border-border bg-background/60 px-2 py-0.5 text-xs font-medium tabular-nums text-foreground">1:{ratio.toFixed(1)}</span>
      </div>
    </>
  )

  return (
    <DashboardCardShell className="rounded-lg p-3">
      {onClick ? <button type="button" onClick={onClick} className="focus-ring w-full rounded text-left">{content}</button> : content}
    </DashboardCardShell>
  )
}

function DistributionMetric({ icon: Icon, label, value, detail, bordered = false }: { icon: LucideIcon; label: string; value: string; detail: string; bordered?: boolean }) {
  return (
    <span className={`${bordered ? 'rounded border border-border/60' : ''} bg-background/60 p-2.5`}>
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Icon className="h-3 w-3" aria-hidden="true" />{label}</span>
      <span className="mt-1.5 flex items-end justify-between gap-2">
        <strong className="text-lg font-semibold tabular-nums text-foreground">{value}</strong>
        <span className="text-[10px] font-medium text-foreground">{detail}</span>
      </span>
    </span>
  )
}
