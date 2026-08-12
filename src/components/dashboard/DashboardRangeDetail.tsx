import { CalendarDays, Layers3, MessageSquare, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import DashboardCardShell from './DashboardCardShell'
import type { SessionStats } from '@/types'
import type { DashboardTimeGranularity } from './dashboardTimeRange'
import { formatTokens } from '@/utils/format'

interface DashboardRangeDetailProps {
  granularity: DashboardTimeGranularity
  stats: SessionStats
  rangeStart: Date | null
  rangeEnd: Date | null
}

const compact = formatTokens

export default function DashboardRangeDetail({ granularity, stats, rangeStart, rangeEnd }: DashboardRangeDetailProps) {
  const { t, i18n } = useTranslation()
  if ((granularity !== 'week' && granularity !== 'month') || !rangeStart || !rangeEnd) return null

  const points = stats.heatmap_data
    .filter((point) => {
      const time = new Date(`${point.date}T00:00:00`).getTime()
      return time >= rangeStart.getTime() && time < rangeEnd.getTime()
    })
    .sort((left, right) => left.date.localeCompare(right.date))
  const active = points.filter((point) => point.total_messages > 0)
  const busiest = [...points].sort((left, right) => right.total_messages - left.total_messages)[0]
  const dateFormatter = new Intl.DateTimeFormat(i18n.language || undefined, { month: 'short', day: 'numeric' })
  const weekdayFormatter = new Intl.DateTimeFormat(i18n.language || undefined, { weekday: 'short' })

  if (granularity === 'week') {
    return (
      <DashboardCardShell className="p-3">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-xs font-medium text-foreground"><CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />{t('dashboard.rangeDetail.weekTitle', 'Week detail')}</h3>
            <p className="mt-1 text-[9px] text-muted-foreground">{t('dashboard.rangeDetail.weekHint', 'A day-by-day view of sessions, messages, tokens, and cost.')}</p>
          </div>
          <span className="text-[9px] text-muted-foreground">{active.length}/7 {t('dashboard.rangeDetail.activeDays', 'active days')}</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {points.map((point) => {
            const date = new Date(`${point.date}T00:00:00`)
            return (
              <div key={point.date} className="rounded border border-border/60 bg-background/45 p-2 text-center">
                <div className="text-[9px] text-muted-foreground">{weekdayFormatter.format(date)}</div>
                <div className="mt-0.5 text-xs font-medium text-foreground">{date.getDate()}</div>
                <div className="mt-2 text-sm font-semibold tabular-nums text-foreground">{compact(point.total_messages)}</div>
                <div className="text-[8px] text-muted-foreground">{point.session_count} {t('dashboard.rangeDetail.sessionsShort', 'sessions')}</div>
                <div className="mt-1 text-[8px] tabular-nums text-muted-foreground">{compact(point.total_tokens)} T</div>
              </div>
            )
          })}
        </div>
      </DashboardCardShell>
    )
  }

  const weeks = new Map<string, typeof points>()
  for (const point of points) {
    const date = new Date(`${point.date}T00:00:00`)
    const mondayOffset = (date.getDay() + 6) % 7
    const monday = new Date(date)
    monday.setDate(date.getDate() - mondayOffset)
    const key = monday.toISOString().slice(0, 10)
    const bucket = weeks.get(key) || []
    bucket.push(point)
    weeks.set(key, bucket)
  }
  const averageActive = active.length ? Math.round(stats.total_messages / active.length) : 0

  return (
    <DashboardCardShell className="p-3">
      <div className="mb-3">
        <h3 className="flex items-center gap-2 text-xs font-medium text-foreground"><Layers3 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />{t('dashboard.rangeDetail.monthTitle', 'Month detail')}</h3>
        <p className="mt-1 text-[9px] text-muted-foreground">{t('dashboard.rangeDetail.monthHint', 'Weekly pacing and daily consistency inside the selected month.')}</p>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border/60 sm:grid-cols-4">
        <Summary icon={CalendarDays} label={t('dashboard.rangeDetail.activeDays', 'Active days')} value={`${active.length}/${points.length}`} />
        <Summary icon={MessageSquare} label={t('dashboard.rangeDetail.avgActiveDay', 'Avg / active day')} value={compact(averageActive)} />
        <Summary icon={Zap} label={t('dashboard.rangeDetail.busiestDay', 'Busiest day')} value={busiest ? dateFormatter.format(new Date(`${busiest.date}T00:00:00`)) : '—'} />
        <Summary icon={Layers3} label={t('dashboard.rangeDetail.calendarWeeks', 'Calendar weeks')} value={String(weeks.size)} />
      </div>
      <div className="space-y-1.5">
        {Array.from(weeks.entries()).map(([weekStart, bucket], index) => {
          const messages = bucket.reduce((sum, point) => sum + point.total_messages, 0)
          const sessions = bucket.reduce((sum, point) => sum + point.session_count, 0)
          const tokens = bucket.reduce((sum, point) => sum + point.total_tokens, 0)
          const share = stats.total_messages > 0 ? messages / stats.total_messages : 0
          return (
            <div key={weekStart} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 rounded border border-border/55 bg-background/40 px-2.5 py-2">
              <span className="text-[10px] font-medium text-foreground">{t('dashboard.rangeDetail.weekNumber', 'Week {{number}}', { number: index + 1 })}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted/60"><span className="block h-full rounded-full bg-primary" style={{ width: `${share * 100}%` }} /></span>
              <span className="text-right text-[9px] tabular-nums text-muted-foreground">{compact(messages)} M · {sessions} S · {compact(tokens)} T</span>
            </div>
          )
        })}
      </div>
    </DashboardCardShell>
  )
}

function Summary({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="bg-background px-2.5 py-2">
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground"><Icon className="h-3 w-3" aria-hidden="true" />{label}</div>
      <div className="mt-1 truncate text-sm font-semibold tabular-nums text-foreground" title={value}>{value}</div>
    </div>
  )
}
