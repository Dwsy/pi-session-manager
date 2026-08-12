import { format, subDays } from 'date-fns'
import { Coins, Database, DollarSign, TrendingUp, Zap, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import DashboardCardShell from './DashboardCardShell'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import type { SessionStats } from '@/types'
import type { DashboardTimeGranularity } from './dashboardTimeRange'
import { formatTokens } from '@/utils/format'

interface TokenTrendChartProps {
  stats: SessionStats
  title?: string
  days?: number
  rangeStart?: Date | null
  rangeEnd?: Date | null
  rangeLabel?: string
  granularity?: DashboardTimeGranularity
}

export default function TokenTrendChart({
  stats,
  title,
  days = 30,
  rangeStart,
  rangeEnd,
  rangeLabel,
  granularity,
}: TokenTrendChartProps) {
  const { t, i18n } = useTranslation()
  const prefersReducedMotion = usePrefersReducedMotion()
  const displayTitle = title || (granularity === 'day' ? t('dashboard.tokenStats.dayTitle', 'Daily token usage') : t('dashboard.tokenStats.title'))
  const heatmapByDate = new Map(stats.heatmap_data.map((point) => [point.date, point]))
  const dateFormatter = new Intl.DateTimeFormat(i18n.language || undefined, { month: 'short', day: 'numeric' })
  const dailyData: { date: string; tokens: number; cost: number; displayDate: string }[] = []

  if (rangeStart && rangeEnd) {
    for (let cursor = new Date(rangeStart); cursor < rangeEnd; cursor.setDate(cursor.getDate() + 1)) {
      const date = new Date(cursor)
      const dateStr = format(date, 'yyyy-MM-dd')
      const point = heatmapByDate.get(dateStr)
      dailyData.push({
        date: dateStr,
        displayDate: dateFormatter.format(date),
        tokens: point?.total_tokens || 0,
        cost: point?.total_cost || 0,
      })
    }
  } else {
    const today = new Date()
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = subDays(today, index)
      const dateStr = format(date, 'yyyy-MM-dd')
      const point = heatmapByDate.get(dateStr)
      dailyData.push({
        date: dateStr,
        displayDate: dateFormatter.format(date),
        tokens: point?.total_tokens || 0,
        cost: point?.total_cost || 0,
      })
    }
  }

  const dailyTokenTotal = dailyData.reduce((sum, item) => sum + item.tokens, 0)
  const totalPeriodTokens = stats.total_tokens
  const totalPeriodCost = stats.token_details.total_cost
  const hasDailyData = dailyTokenTotal > 0
  const hasPeriodData = totalPeriodTokens > 0 || totalPeriodCost > 0
  const isSingleDay = granularity === 'day' || (granularity === undefined && dailyData.length === 1)
  const chartAnimationDuration = prefersReducedMotion ? 0 : 500
  const periodLabel = rangeLabel || t('dashboard.tokenStats.daysLabel', '{{count}} days', { count: dailyData.length })

  const formatCost = (cost: number) => {
    if (cost === 0) return '$0.00'
    if (cost < 0.01) return `$${cost.toFixed(4)}`
    if (cost < 1) return `$${cost.toFixed(3)}`
    return `$${cost.toFixed(2)}`
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const item = payload[0].payload
    return (
      <div className="rounded border border-border bg-background px-3 py-2 text-xs shadow-lg">
        <div className="mb-1 font-medium text-foreground">{item.displayDate}</div>
        <div className="flex items-center gap-1 text-success">
          <Zap className="h-3 w-3" aria-hidden="true" />
          {formatTokens(item.tokens)}
        </div>
        <div className="text-destructive">{formatCost(item.cost)}</div>
      </div>
    )
  }

  return (
    <DashboardCardShell className="rounded-lg p-3 !border-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <span className={`rounded p-1 ${isSingleDay ? 'bg-purple/10' : 'bg-success/10'}`}>
            {isSingleDay ? <Coins className="h-3 w-3 text-purple" aria-hidden="true" /> : <TrendingUp className="h-3 w-3 text-success" aria-hidden="true" />}
          </span>
          {displayTitle}
        </h3>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{periodLabel}: <strong className="font-medium text-foreground">{formatTokens(totalPeriodTokens)}</strong></span>
          <strong className="font-medium text-destructive">{formatCost(totalPeriodCost)}</strong>
        </div>
      </div>

      {isSingleDay ? (
        <div>
          {rangeLabel ? <div className="mb-2 text-[10px] font-medium text-foreground">{rangeLabel}</div> : null}
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border/60 sm:grid-cols-4">
            <SingleDayMetric icon={Coins} label={t('dashboard.tokenStats.input', 'Input')} value={formatTokens(stats.token_details.total_input)} />
            <SingleDayMetric icon={Zap} label={t('dashboard.tokenStats.output', 'Output')} value={formatTokens(stats.token_details.total_output)} />
            <SingleDayMetric icon={Database} label={t('dashboard.tokenStats.cache', 'Cache')} value={formatTokens(stats.token_details.total_cache_read + stats.token_details.total_cache_write)} />
            <SingleDayMetric icon={DollarSign} label={t('dashboard.tokenStats.cost', 'Cost')} value={formatCost(totalPeriodCost)} />
          </div>
        </div>
      ) : !hasDailyData ? (
        <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
          <div className="text-center">
            <TrendingUp className="mx-auto mb-2 h-6 w-6 opacity-30" aria-hidden="true" />
            <p>{hasPeriodData
              ? t('dashboard.tokenStats.dailyUnavailable', 'Daily token breakdown is unavailable for this range')
              : t('components.tokenTrend.noData')}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="h-24 min-h-[80px] w-full min-w-[100px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={80}>
              <AreaChart data={dailyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="dashboard-token-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="rgb(var(--color-success))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="rgb(var(--color-info))" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="displayDate"
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  tick={{ fill: 'rgb(var(--color-muted-foreground))' }}
                />
                <YAxis
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatTokens}
                  tick={{ fill: 'rgb(var(--color-muted-foreground))' }}
                  width={40}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke="rgb(var(--color-success))"
                  strokeWidth={2}
                  fill="url(#dashboard-token-gradient)"
                  animationDuration={chartAnimationDuration}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-foreground/5 pt-2 text-[9px]">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              <span className="text-muted-foreground">{t('dashboard.tokenStats.tokenUsage', 'Token Usage')}</span>
            </div>
            <div className="text-muted-foreground">
              {t('dashboard.tokenStats.dailyAverage', 'Avg')}: <span className="font-medium text-foreground">{formatTokens(Math.round(dailyTokenTotal / Math.max(dailyData.length, 1)))}/{t('dashboard.tokenStats.dayUnit', 'day')}</span>
            </div>
          </div>
        </>
      )}
    </DashboardCardShell>
  )
}


function SingleDayMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="bg-background px-3 py-3">
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground"><Icon className="h-3 w-3" aria-hidden="true" />{label}</div>
      <strong className="mt-1 block text-base tabular-nums text-foreground">{value}</strong>
    </div>
  )
}
