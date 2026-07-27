import type { ReactNode } from 'react'
import { Calendar, Coins, DollarSign, MessageSquare, Rows3, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import DashboardCardShell from './DashboardCardShell'
import HeatmapTooltip from './HeatmapTooltip'
import type { HeatmapPoint } from '@/types'
import type { DashboardTimeGranularity } from './dashboardTimeRange'

interface ActivityHeatmapProps {
  data: HeatmapPoint[]
  title?: string
  size?: 'mini' | 'full'
  showLabels?: boolean
  onDayClick?: (point: HeatmapPoint) => void
  onProjectFilter?: (projectName: string) => void
  rangeStart?: Date | null
  rangeEnd?: Date | null
  granularity?: DashboardTimeGranularity
}

const HEATMAP_COLORS = [
  'rgb(var(--color-muted-foreground) / 0.12)',
  'rgb(var(--color-success) / 0.24)',
  'rgb(var(--color-success) / 0.42)',
  'rgb(var(--color-success) / 0.62)',
  'rgb(var(--color-success) / 0.82)',
  'rgb(var(--color-success))',
]

const DAY_MS = 24 * 60 * 60 * 1000

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

export default function ActivityHeatmap({
  data,
  title,
  size = 'full',
  onDayClick,
  onProjectFilter,
  rangeStart,
  rangeEnd,
  granularity,
}: ActivityHeatmapProps) {
  const { t, i18n } = useTranslation()
  const displayTitle = title || (granularity === 'day' ? t('dashboard.dayView.activityTitle', 'Daily activity') : t('components.activityHeatmap.title'))
  const dataMap = new Map(data.map((point) => [point.date, point]))
  const rangeDays = rangeStart && rangeEnd
    ? Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS))
    : null
  const layout = granularity === 'day' || (granularity === undefined && rangeDays === 1)
    ? 'day'
    : rangeDays !== null && rangeDays <= 8
      ? 'week'
      : rangeDays !== null && rangeDays <= 45
      ? 'month'
      : 'history'
  const dayFormatter = new Intl.DateTimeFormat(i18n.language || undefined, { weekday: 'short' })
  const monthDayFormatter = new Intl.DateTimeFormat(i18n.language || undefined, { month: 'short', day: 'numeric' })

  const wrapPoint = (point: HeatmapPoint | undefined, child: ReactNode, key: string) => {
    if (!point || point.level <= 0) return <div key={key}>{child}</div>
    return (
      <HeatmapTooltip key={key} point={point} onViewDetails={onDayClick} onFilterProject={onProjectFilter}>
        {child}
      </HeatmapTooltip>
    )
  }

  const renderDay = () => {
    if (!rangeStart) return null
    const point = dataMap.get(dateKey(rangeStart))
    const level = point?.level || 0
    const activityLabel = [
      t('dashboard.activityLevels.none', 'No activity'),
      t('dashboard.activityLevels.low', 'Low'),
      t('dashboard.activityLevels.low', 'Low'),
      t('dashboard.activityLevels.medium', 'Medium'),
      t('dashboard.activityLevels.high', 'High'),
      t('dashboard.activityLevels.veryHigh', 'Very high'),
    ][level]
    const formatTokens = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}k` : value.toLocaleString()
    const formatCost = (value: number) => value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(value < 1 ? 3 : 2)}`
    const content = (
      <button
        type="button"
        onClick={() => point && onDayClick?.(point)}
        disabled={!point}
        className="focus-ring grid w-full gap-3 rounded border border-border bg-background/55 p-3 text-left disabled:cursor-default sm:grid-cols-[104px_minmax(0,1fr)]"
        aria-label={`${monthDayFormatter.format(rangeStart)}: ${point?.total_messages || 0} messages`}
      >
        <span className="flex min-h-24 flex-col items-center justify-center rounded border border-border/60 bg-muted/15 px-2 text-center">
          <span className="h-9 w-9 rounded-md border border-border/70" style={{ backgroundColor: HEATMAP_COLORS[level] }} aria-hidden="true" />
          <strong className="mt-2 text-sm font-semibold text-foreground">{activityLabel}</strong>
          <span className="mt-0.5 text-[9px] text-muted-foreground">{t('dashboard.dayView.activityLevel', 'Activity level')} {level}/5</span>
        </span>
        <span className="grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border/60">
          <DayMetric icon={MessageSquare} label={t('dashboard.dayView.messages', 'Messages')} value={(point?.total_messages || 0).toLocaleString()} />
          <DayMetric icon={Rows3} label={t('dashboard.dayView.sessions', 'Sessions')} value={(point?.session_count || 0).toLocaleString()} />
          <DayMetric icon={Coins} label={t('dashboard.dayView.tokens', 'Tokens')} value={formatTokens(point?.total_tokens || 0)} />
          <DayMetric icon={DollarSign} label={t('dashboard.dayView.cost', 'Cost')} value={formatCost(point?.total_cost || 0)} />
        </span>
      </button>
    )
    return wrapPoint(point, content, dateKey(rangeStart))
  }

  const renderWeek = () => {
    if (!rangeStart || !rangeEnd) return null
    const days: Date[] = []
    for (let cursor = new Date(rangeStart); cursor < rangeEnd; cursor.setDate(cursor.getDate() + 1)) days.push(new Date(cursor))
    return (
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((date) => {
          const key = dateKey(date)
          const point = dataMap.get(key)
          const cell = (
            <button
              type="button"
              onClick={() => point && onDayClick?.(point)}
              disabled={!point}
              className="focus-ring flex min-h-14 w-full flex-col items-center justify-center rounded border border-border/55 px-1.5 py-2 text-center disabled:cursor-default"
              style={{ backgroundColor: HEATMAP_COLORS[point?.level || 0] }}
              aria-label={`${monthDayFormatter.format(date)}: ${point?.total_messages || 0} messages`}
            >
              <span className="text-[9px] text-muted-foreground">{dayFormatter.format(date)}</span>
              <strong className="mt-0.5 text-xs tabular-nums text-foreground">{date.getDate()}</strong>
              <span className="mt-1 text-[9px] tabular-nums text-muted-foreground">{point?.total_messages || 0}</span>
            </button>
          )
          return wrapPoint(point, cell, key)
        })}
      </div>
    )
  }

  const renderMonth = () => {
    if (!rangeStart || !rangeEnd) return null
    const days: Date[] = []
    for (let cursor = new Date(rangeStart); cursor < rangeEnd; cursor.setDate(cursor.getDate() + 1)) days.push(new Date(cursor))
    const leading = days.length ? mondayIndex(days[0]) : 0
    return (
      <div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[9px] text-muted-foreground">
          {Array.from({ length: 7 }, (_, index) => {
            const date = new Date(2026, 0, 5 + index)
            return <span key={index}>{dayFormatter.format(date)}</span>
          })}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leading }, (_, index) => <div key={`blank-${index}`} aria-hidden="true" />)}
          {days.map((date) => {
            const key = dateKey(date)
            const point = dataMap.get(key)
            const cell = (
              <button
                type="button"
                onClick={() => point && onDayClick?.(point)}
                disabled={!point}
                className="focus-ring flex min-h-11 w-full flex-col items-start justify-between rounded border border-border/45 p-1.5 text-left disabled:cursor-default"
                style={{ backgroundColor: HEATMAP_COLORS[point?.level || 0] }}
                aria-label={`${monthDayFormatter.format(date)}: ${point?.total_messages || 0} messages`}
              >
                <span className="text-[9px] font-medium tabular-nums text-foreground">{date.getDate()}</span>
                <span className="self-end text-[8px] tabular-nums text-muted-foreground">{point?.total_messages || 0}</span>
              </button>
            )
            return wrapPoint(point, cell, key)
          })}
        </div>
      </div>
    )
  }

  const renderHistory = () => {
    if (!data.length) return null
    const sorted = [...data].sort((left, right) => left.date.localeCompare(right.date))
    const rawStart = rangeStart ? new Date(rangeStart) : parseDateKey(sorted[0].date)
    const rawEnd = rangeEnd ? new Date(rangeEnd.getTime() - 1) : parseDateKey(sorted[sorted.length - 1].date)
    const start = new Date(rawStart.getFullYear(), rawStart.getMonth(), rawStart.getDate())
    start.setDate(start.getDate() - mondayIndex(start))
    const end = new Date(rawEnd.getFullYear(), rawEnd.getMonth(), rawEnd.getDate())
    end.setDate(end.getDate() + (6 - mondayIndex(end)))
    const weeks = Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * DAY_MS)) + 1)
    const rows = Array.from({ length: 7 }, (_, dayIndex) =>
      Array.from({ length: weeks }, (_, weekIndex) => {
        const date = new Date(start)
        date.setDate(start.getDate() + weekIndex * 7 + dayIndex)
        return { date, point: dataMap.get(dateKey(date)) }
      }),
    )
    return (
      <div className="overflow-x-auto pb-1">
        <div className="w-max space-y-0.5">
          {rows.map((row, dayIndex) => (
            <div key={dayIndex} className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${weeks}, 12px)` }}>
              {row.map(({ date, point }) => {
                const key = dateKey(date)
                const cell = (
                  <button
                    type="button"
                    onClick={() => point && onDayClick?.(point)}
                    disabled={!point}
                    className="focus-ring h-3 w-3 rounded-[2px] disabled:cursor-default"
                    style={{ backgroundColor: HEATMAP_COLORS[point?.level || 0] }}
                    aria-label={`${monthDayFormatter.format(date)}: ${point?.total_messages || 0} messages`}
                  />
                )
                return wrapPoint(point, cell, key)
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <DashboardCardShell className="rounded-xl p-3">
      {displayTitle ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
            <span className="rounded-lg bg-success/10 p-1.5"><Calendar className="h-4 w-4 text-success" aria-hidden="true" /></span>
            <span className="truncate">{displayTitle}</span>
          </h3>
          {layout === 'day' && rangeStart ? (
            <span className="text-[10px] font-medium text-foreground">{monthDayFormatter.format(rangeStart)} · {dayFormatter.format(rangeStart)}</span>
          ) : (
            <div className="flex items-center gap-1 text-[9px] text-muted-foreground" aria-hidden="true">
              <span>{t('components.activityHeatmap.less')}</span>
              {HEATMAP_COLORS.slice(1).map((color, index) => <span key={index} className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: color }} />)}
              <span>{t('components.activityHeatmap.more')}</span>
            </div>
          )}
        </div>
      ) : null}
      {layout === 'day' ? renderDay() : layout === 'week' ? renderWeek() : layout === 'month' ? renderMonth() : renderHistory()}
      {size === 'full' && layout !== 'day' ? (
        <div className="mt-3 border-t border-foreground/5 pt-3 text-xs text-muted-foreground">
          {t('components.activityHeatmap.activeDays')}: <strong className="text-foreground">{data.filter((point) => point.level > 0).length}</strong>
        </div>
      ) : null}
    </DashboardCardShell>
  )
}


function DayMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <span className="bg-background px-3 py-3">
      <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><Icon className="h-3 w-3" aria-hidden="true" />{label}</span>
      <strong className="mt-1 block text-base tabular-nums text-foreground">{value}</strong>
    </span>
  )
}
