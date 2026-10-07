import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { SessionInfo, SessionStats } from '@/types'
import { getPathBasename } from '@/utils/path'
import DashboardDialog from './DashboardDialog'
import { deriveDashboardInsights, type DashboardInsights } from './dashboardInsights'
import { formatRecapRange, getPreviousRecapPeriod } from './recap/recapPeriods'
import {
  deriveRecapReport,
  type RecapDaypartId,
  type RecapPreviousData,
  type RecapReport,
  type RecapTokenKind,
} from './recap/recapReport'
import type { DashboardRecapRequest } from './dashboardRecap'

interface DashboardRecapModalProps {
  request: DashboardRecapRequest
  sessions: SessionInfo[]
  stats: SessionStats | null
  previous?: RecapPreviousData | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onClose: () => void
}

function compact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatCost(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value)
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatHour(hour: number | undefined): string {
  return hour == null ? '—' : `${String(hour).padStart(2, '0')}:00`
}

function makeDateFormatter(locale: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, options)
  } catch {
    // A malformed locale tag must never break the report.
    return new Intl.DateTimeFormat(undefined, options)
  }
}

const TOKEN_STYLES: Record<RecapTokenKind, string> = {
  input: 'bg-primary',
  output: 'bg-primary/70',
  cacheRead: 'bg-primary/45',
  cacheWrite: 'bg-primary/25',
}

export default function DashboardRecapModal({
  request,
  sessions,
  stats,
  previous = null,
  loading,
  error,
  onRetry,
  onClose,
}: DashboardRecapModalProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || undefined
  const periodTitle = t(
    request.period.label.key,
    request.period.label.fallback,
    request.period.label.values,
  )
  const rangeLabel = formatRecapRange(request.period, locale)

  const analysis = useMemo(() => {
    if (!stats || sessions.length === 0) return null
    return {
      insights: deriveDashboardInsights(stats, sessions, request.period.end),
      report: deriveRecapReport(stats, sessions, request.period, previous),
    }
  }, [stats, sessions, request.period, previous])

  const previousRange = analysis?.report.changes
    ? formatRecapRange(getPreviousRecapPeriod(request.period), locale)
    : null

  return (
    <DashboardDialog
      open
      onClose={onClose}
      title={periodTitle}
      subtitle={rangeLabel}
      ariaLabel={t('dashboard.recap.dialogLabel', '{{period}} recap', { period: periodTitle })}
      className="max-w-5xl"
      bodyClassName="space-y-6"
    >
      {loading ? (
        <div className="grid min-h-72 place-items-center text-sm text-muted-foreground" role="status">
          {t('dashboard.recap.loading', 'Loading period statistics…')}
        </div>
      ) : error ? (
        <div className="grid min-h-72 place-items-center">
          <div className="max-w-lg">
            <div
              className="rounded border border-destructive/35 bg-destructive/8 px-3 py-2.5 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="focus-ring mt-3 h-8 rounded border border-border px-3 text-xs text-foreground hover:bg-muted/40"
            >
              {t('dashboard.recap.retry', 'Retry')}
            </button>
          </div>
        </div>
      ) : !analysis ? (
        <div className="min-h-72 border-y border-border py-16 text-center">
          <h3 className="text-sm font-medium text-foreground">
            {t('dashboard.recap.report.emptyTitle', 'No activity in this period')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('dashboard.recap.report.emptyDescription', 'No sessions were recorded in this date range.')}
          </p>
        </div>
      ) : (
        <ReportBody
          report={analysis.report}
          insights={analysis.insights}
          locale={locale}
          previousRange={previousRange}
        />
      )}
    </DashboardDialog>
  )
}

function ReportBody({
  report,
  insights,
  locale,
  previousRange,
}: {
  report: RecapReport
  insights: DashboardInsights
  locale: string | undefined
  previousRange: string | null
}) {
  const { t } = useTranslation()
  const { totals, changes, activity, series, weekday, hours, dayparts, tokenMix, efficiency } = report

  const longDate = makeDateFormatter(locale, { weekday: 'short', month: 'short', day: 'numeric' })
  const bucketDate = makeDateFormatter(
    locale,
    series.unit === 'month' ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' },
  )
  const weekdayName = makeDateFormatter(locale, { weekday: 'short' })
  // 2024-01-01 is a Monday, matching the Monday-first weekday series.
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => weekdayName.format(new Date(2024, 0, 1 + index)))

  const messagesLabel = (count: number) => t('dashboard.recap.report.messagesValue', '{{count}} messages', { count })

  const daypartLabels: Record<RecapDaypartId, string> = {
    night: t('dashboard.recap.report.daypartNight', 'Night · 00–05'),
    morning: t('dashboard.recap.report.daypartMorning', 'Morning · 06–11'),
    afternoon: t('dashboard.recap.report.daypartAfternoon', 'Afternoon · 12–17'),
    evening: t('dashboard.recap.report.daypartEvening', 'Evening · 18–23'),
  }
  const tokenLabels: Record<RecapTokenKind, string> = {
    input: t('dashboard.recap.report.tokenInput', 'Input'),
    output: t('dashboard.recap.report.tokenOutput', 'Output'),
    cacheRead: t('dashboard.recap.report.tokenCacheRead', 'Cache read'),
    cacheWrite: t('dashboard.recap.report.tokenCacheWrite', 'Cache write'),
  }

  const busiest = activity.busiestDay
  const priciest = activity.priciestDay
  const deepest = insights.deepestSession
  const deepestName = deepest?.name || (deepest ? getPathBasename(deepest.cwd) : '—')

  const headline = t(
    'dashboard.recap.report.headline',
    '{{sessions}} sessions and {{messages}} messages across {{count}} active days.',
    {
      sessions: compact(totals.sessions),
      messages: compact(totals.messages),
      count: activity.activeDays,
    },
  )
  const headlineBusiest = busiest
    ? t('dashboard.recap.report.headlineBusiest', 'Busiest day: {{date}}, with {{messages}} messages.', {
        date: longDate.format(busiest.date),
        messages: compact(busiest.messages),
      })
    : null

  const unitHint = t(
    series.unit === 'day'
      ? 'dashboard.recap.report.unitDay'
      : series.unit === 'week'
        ? 'dashboard.recap.report.unitWeek'
        : 'dashboard.recap.report.unitMonth',
    series.unit === 'day' ? 'Messages per day' : series.unit === 'week' ? 'Messages per week' : 'Messages per month',
  )

  const seriesBars = series.buckets.map((bucket) => ({
    value: bucket.messages,
    label: `${bucketDate.format(bucket.start)} · ${messagesLabel(bucket.messages)}`,
  }))
  const firstBucket = series.buckets[0]
  const lastBucket = series.buckets[series.buckets.length - 1]

  const hourBars = hours.messages.map((value, hour) => ({
    value,
    label: `${formatHour(hour)} · ${messagesLabel(value)}`,
  }))
  const weekdayBars = weekday.messages.map((value, index) => ({
    value,
    label: `${weekdayLabels[index]} · ${messagesLabel(value)}`,
  }))

  const projectItems = report.projects.map((project) => ({
    key: project.name,
    name: getPathBasename(project.name),
    title: project.name,
    share: project.share,
    detail: t('dashboard.recap.report.sessionsShare', '{{count}} sessions · {{share}}', {
      count: project.sessions ?? 0,
      share: formatPercent(project.share),
    }),
  }))
  const modelItems = report.models.items.map((model) => ({
    key: model.name,
    name: model.name,
    title: model.name,
    share: model.share,
    detail: t('dashboard.recap.report.modelDetail', '{{cost}} · {{tokens}} tokens', {
      cost: formatCost(model.cost ?? 0),
      tokens: compact(model.tokens ?? 0),
    }),
  }))

  return (
    <>
      <section aria-label={t('dashboard.recap.report.totals', 'Period totals')}>
        <p className="text-sm leading-relaxed text-foreground">
          {headline}
          {headlineBusiest ? <span className="text-muted-foreground"> {headlineBusiest}</span> : null}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 md:grid-cols-4">
          <SummaryValue
            label={t('dashboard.stats.sessions', 'Sessions')}
            value={compact(totals.sessions)}
            change={changes?.sessions}
          />
          <SummaryValue
            label={t('dashboard.stats.messages', 'Messages')}
            value={compact(totals.messages)}
            change={changes?.messages}
          />
          <SummaryValue
            label={t('dashboard.stats.tokens', 'Tokens')}
            value={compact(totals.tokens)}
            change={changes?.tokens}
          />
          <SummaryValue
            label={t('dashboard.recap.stat.cost', 'Model spend')}
            value={formatCost(totals.cost)}
            change={changes?.cost}
          />
        </dl>
        {previousRange ? (
          <p className="mt-2 text-[10px] text-muted-foreground">
            {t('dashboard.recap.report.vsPreviousNote', 'Change compared with the previous period ({{range}}).', {
              range: previousRange,
            })}
          </p>
        ) : null}
      </section>

      <Section title={t('dashboard.recap.report.activityOverTime', 'Activity over time')} hint={unitHint}>
        <BarChart
          bars={seriesBars}
          peakIndex={series.peakIndex}
          heightClass="h-28"
          ariaLabel={t('dashboard.recap.report.activityOverTime', 'Activity over time')}
        />
        {firstBucket && lastBucket ? (
          <AxisRow left={bucketDate.format(firstBucket.start)} right={bucketDate.format(lastBucket.start)} />
        ) : null}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title={t('dashboard.recap.report.timeOfDay', 'Time of day')}
          hint={
            hours.peakIndex >= 0
              ? t('dashboard.recap.report.peakHourHint', 'Peak {{hour}}', { hour: formatHour(hours.peakIndex) })
              : undefined
          }
        >
          <BarChart
            bars={hourBars}
            peakIndex={hours.peakIndex}
            heightClass="h-20"
            ariaLabel={t('dashboard.recap.report.timeOfDay', 'Time of day')}
          />
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
            {['00', '06', '12', '18', '23'].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/70 pt-3">
            {dayparts.map((daypart) => (
              <div key={daypart.id} className="flex items-baseline justify-between gap-2">
                <dt className="truncate text-[11px] text-muted-foreground">{daypartLabels[daypart.id]}</dt>
                <dd className="text-xs font-medium tabular-nums text-foreground">{formatPercent(daypart.share)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          title={t('dashboard.recap.report.dayOfWeek', 'Day of week')}
          hint={
            weekday.peakIndex >= 0
              ? t('dashboard.recap.report.peakDayHint', 'Peak {{day}}', { day: weekdayLabels[weekday.peakIndex] })
              : undefined
          }
        >
          <BarChart
            bars={weekdayBars}
            peakIndex={weekday.peakIndex}
            heightClass="h-20"
            gapClass="gap-1.5"
            ariaLabel={t('dashboard.recap.report.dayOfWeek', 'Day of week')}
          />
          <div className="mt-1 flex gap-1.5 text-[10px] text-muted-foreground">
            {weekdayLabels.map((label, index) => (
              <span key={index} className="min-w-0 flex-1 truncate text-center">
                {label}
              </span>
            ))}
          </div>
          <dl className="mt-3 divide-y divide-border/70 border-y border-border/70">
            <ReportRow
              label={t('dashboard.recap.report.sessionDays', 'Session days')}
              value={t('dashboard.recap.report.activeDaysValue', '{{active}} / {{total}}', {
                active: activity.activeDays,
                total: report.range.elapsedDays,
              })}
              detail={t('dashboard.recap.report.activeDaysShare', '{{share}} of the period', {
                share: formatPercent(activity.activeShare),
              })}
            />
            <ReportRow
              label={t('dashboard.recap.report.longestRun', 'Consecutive session days')}
              value={t('dashboard.recap.report.daysValue', '{{count}} days', { count: activity.longestRun })}
            />
          </dl>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('dashboard.recap.report.tokenMix', 'Token mix')}>
          <div
            className="flex h-2 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={t('dashboard.recap.report.tokenMix', 'Token mix')}
          >
            {tokenMix.map((part) =>
              part.share > 0 ? (
                <div
                  key={part.kind}
                  className={TOKEN_STYLES[part.kind]}
                  style={{ width: `${part.share * 100}%` }}
                  title={`${tokenLabels[part.kind]} · ${formatPercent(part.share)}`}
                />
              ) : null,
            )}
          </div>
          <dl className="mt-3 divide-y divide-border/70 border-y border-border/70">
            {tokenMix.map((part) => (
              <div key={part.kind} className="flex items-center justify-between gap-3 py-2">
                <dt className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                  <span className={`h-2 w-2 shrink-0 rounded-sm ${TOKEN_STYLES[part.kind]}`} aria-hidden="true" />
                  <span className="truncate">{tokenLabels[part.kind]}</span>
                </dt>
                <dd className="text-xs font-medium tabular-nums text-foreground">
                  {compact(part.value)}
                  <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                    {formatPercent(part.share)}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title={t('dashboard.recap.report.efficiency', 'Efficiency')}>
          <dl className="divide-y divide-border/70 border-y border-border/70">
            <ReportRow
              label={t('dashboard.recap.report.costPerSession', 'Spend per session')}
              value={formatCost(efficiency.costPerSession)}
            />
            <ReportRow
              label={t('dashboard.recap.report.tokensPerMessage', 'Tokens per message')}
              value={compact(Math.round(efficiency.tokensPerMessage))}
            />
            <ReportRow
              label={t('dashboard.recap.report.messagesPerActiveDay', 'Messages per active day')}
              value={efficiency.messagesPerActiveDay.toFixed(1)}
            />
            <ReportRow
              label={t('dashboard.recap.report.replyRatio', 'Assistant to user messages')}
              value={`${efficiency.assistantUserRatio.toFixed(1)} : 1`}
            />
            <ReportRow
              label={t('dashboard.recap.report.sessionDepth', 'Session depth')}
              value={`${Math.round(insights.medianMessagesPerSession)} / ${insights.p90MessagesPerSession}`}
              detail={t('dashboard.recap.report.medianP90', 'median / P90 messages')}
            />
            <ReportRow
              label={t('dashboard.recap.report.cacheShare', 'Cache share')}
              value={formatPercent(insights.cacheShare)}
              detail={t('dashboard.recap.report.cacheShareHint', 'of measured input, output, and cache tokens')}
            />
            {report.subagents ? (
              <ReportRow
                label={t('dashboard.recap.report.subagents', 'Subagents')}
                value={t('dashboard.recap.report.subagentRuns', '{{runs}} runs · {{cost}}', {
                  runs: compact(report.subagents.runs),
                  cost: formatCost(report.subagents.cost),
                })}
              />
            ) : null}
          </dl>
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title={t('dashboard.recap.report.projects', 'Projects')}
          hint={t('dashboard.recap.report.projectsHint', 'by sessions')}
        >
          <RankedList items={projectItems} />
        </Section>
        <Section
          title={t('dashboard.recap.report.models', 'Models')}
          hint={
            report.models.rankedBy === 'cost'
              ? t('dashboard.recap.report.modelsBySpend', 'by spend')
              : t('dashboard.recap.report.modelsByTokens', 'by tokens')
          }
        >
          <RankedList items={modelItems} />
        </Section>
      </div>

      <Section title={t('dashboard.recap.report.highlights', 'Highlights')}>
        <div className="grid gap-x-6 lg:grid-cols-2">
          <dl className="divide-y divide-border/70 border-y border-border/70">
            <ReportRow
              label={t('dashboard.recap.report.busiestDay', 'Busiest day')}
              value={busiest ? longDate.format(busiest.date) : '—'}
              detail={busiest ? messagesLabel(busiest.messages) : undefined}
            />
            <ReportRow
              label={t('dashboard.recap.report.priciestDay', 'Highest-spend day')}
              value={priciest ? longDate.format(priciest.date) : '—'}
              detail={priciest ? formatCost(priciest.cost) : undefined}
            />
          </dl>
          <dl className="divide-y divide-border/70 border-b border-border/70 lg:border-y">
            <ReportRow
              label={t('dashboard.recap.report.deepestSession', 'Deepest session')}
              value={deepestName}
              detail={deepest ? messagesLabel(deepest.message_count) : undefined}
              title={deepestName}
            />
            <ReportRow
              label={t('dashboard.recap.report.firstActiveDay', 'First active day')}
              value={activity.firstActiveDay ? longDate.format(activity.firstActiveDay) : '—'}
            />
          </dl>
        </div>
      </Section>

      <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
        {t('dashboard.recap.report.localOnly', 'Calculated locally from dashboard statistics. No network or model call is used.')}
      </p>
    </>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        {hint ? <span className="truncate text-[10px] text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function SummaryValue({ label, value, change }: { label: string; value: string; change?: number | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="truncate text-lg font-semibold tabular-nums text-foreground" title={value}>
          {value}
        </span>
        {change != null ? <ChangeBadge value={change} /> : null}
      </dd>
    </div>
  )
}

function ChangeBadge({ value }: { value: number }) {
  const rounded = Math.round(value)
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : Minus
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {rounded > 0 ? '+' : ''}
      {rounded}%
    </span>
  )
}

function BarChart({
  bars,
  peakIndex,
  ariaLabel,
  heightClass,
  gapClass = 'gap-px',
}: {
  bars: { value: number; label: string }[]
  peakIndex: number
  ariaLabel: string
  heightClass: string
  gapClass?: string
}) {
  const max = Math.max(...bars.map((bar) => bar.value), 1)
  return (
    <div role="img" aria-label={ariaLabel} className={`flex items-end ${gapClass} ${heightClass}`}>
      {bars.map((bar, index) => {
        const isPeak = index === peakIndex && bar.value > 0
        return (
          <div key={index} className="group flex h-full min-w-0 flex-1 items-end" title={bar.label}>
            <div
              className={`w-full rounded-t-[2px] transition-colors ${
                bar.value <= 0
                  ? 'bg-border/70'
                  : isPeak
                    ? 'bg-primary'
                    : 'bg-primary/30 group-hover:bg-primary/60'
              }`}
              style={{ height: bar.value > 0 ? `${Math.max((bar.value / max) * 100, 4)}%` : '2px' }}
            />
          </div>
        )
      })}
    </div>
  )
}

function AxisRow({ left, right }: { left: string; right: string }) {
  return (
    <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  )
}

function RankedList({
  items,
}: {
  items: { key: string; name: string; title: string; share: number; detail: string }[]
}) {
  if (items.length === 0) {
    return <div className="border-y border-border/70 py-3 text-xs text-muted-foreground">—</div>
  }
  return (
    <ol className="divide-y divide-border/70 border-y border-border/70">
      {items.map((item) => (
        <li key={item.key} className="py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-xs font-medium text-foreground" title={item.title}>
              {item.name}
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{item.detail}</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${Math.max(item.share * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}

function ReportRow({
  label,
  value,
  detail,
  title,
}: {
  label: string
  value: string
  detail?: string
  title?: string
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start gap-4 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">
        <div className="truncate text-xs font-medium tabular-nums text-foreground" title={title ?? value}>
          {value}
        </div>
        {detail ? <div className="mt-0.5 text-[10px] text-muted-foreground">{detail}</div> : null}
      </dd>
    </div>
  )
}
