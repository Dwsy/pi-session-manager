import { useTranslation } from 'react-i18next'
import type { SessionInfo, SessionStats } from '@/types'
import { getPathBasename } from '@/utils/path'
import DashboardDialog from './DashboardDialog'
import { deriveDashboardInsights } from './dashboardInsights'
import { formatRecapRange } from './recap/recapPeriods'
import type { DashboardRecapRequest } from './dashboardRecap'

interface DashboardRecapModalProps {
  request: DashboardRecapRequest
  sessions: SessionInfo[]
  stats: SessionStats | null
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

function summarizeSessionDays(sessions: SessionInfo[]): { activeDays: number; longestRun: number } {
  const dayTimes = [...new Set(sessions.map((session) => {
    const modified = new Date(session.modified)
    if (Number.isNaN(modified.getTime())) return null
    return new Date(modified.getFullYear(), modified.getMonth(), modified.getDate()).getTime()
  }).filter((value): value is number => value !== null))].sort((a, b) => a - b)

  let longestRun = 0
  let currentRun = 0
  let previous: number | null = null
  for (const day of dayTimes) {
    const consecutive = previous !== null && Math.round((day - previous) / (24 * 60 * 60 * 1000)) === 1
    currentRun = consecutive ? currentRun + 1 : 1
    longestRun = Math.max(longestRun, currentRun)
    previous = day
  }

  return { activeDays: dayTimes.length, longestRun }
}

export default function DashboardRecapModal({
  request,
  sessions,
  stats,
  loading,
  error,
  onRetry,
  onClose,
}: DashboardRecapModalProps) {
  const { t, i18n } = useTranslation()
  const periodTitle = t(
    request.period.label.key,
    request.period.label.fallback,
    request.period.label.values,
  )
  const rangeLabel = formatRecapRange(request.period, i18n.language || undefined)
  const insights = stats ? deriveDashboardInsights(stats, sessions, request.period.end) : null
  const sessionDays = summarizeSessionDays(sessions)

  const topProject = insights?.topProject
  const topModel = insights?.topModel
  const deepest = insights?.deepestSession
  const deepestName = deepest?.name || (deepest ? getPathBasename(deepest.cwd) : '—')

  return (
    <DashboardDialog
      open
      onClose={onClose}
      title={periodTitle}
      subtitle={rangeLabel}
      ariaLabel={t('dashboard.recap.dialogLabel', '{{period}} recap', { period: periodTitle })}
      className="max-w-5xl"
      bodyClassName="space-y-5"
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
      ) : !stats || sessions.length === 0 || !insights ? (
        <div className="min-h-72 border-y border-border py-16 text-center">
          <h3 className="text-sm font-medium text-foreground">
            {t('dashboard.recap.report.emptyTitle', 'No activity in this period')}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('dashboard.recap.report.emptyDescription', 'No sessions were recorded in this date range.')}
          </p>
        </div>
      ) : (
        <>
          <section aria-label={t('dashboard.recap.report.totals', 'Period totals')}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 md:grid-cols-4">
              <SummaryValue label={t('dashboard.stats.sessions', 'Sessions')} value={compact(sessions.length)} />
              <SummaryValue label={t('dashboard.stats.messages', 'Messages')} value={compact(stats.total_messages)} />
              <SummaryValue label={t('dashboard.stats.tokens', 'Tokens')} value={compact(stats.total_tokens)} />
              <SummaryValue label={t('dashboard.recap.stat.cost', 'Model spend')} value={formatCost(stats.token_details.total_cost)} />
            </dl>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h3 className="text-xs font-semibold text-foreground">
                {t('dashboard.recap.report.activity', 'Activity')}
              </h3>
              <dl className="mt-2 divide-y divide-border/70 border-y border-border/70">
                <ReportRow
                  label={t('dashboard.recap.report.sessionDays', 'Session days')}
                  value={compact(sessionDays.activeDays)}
                />
                <ReportRow
                  label={t('dashboard.recap.report.longestRun', 'Consecutive session days')}
                  value={t('dashboard.recap.report.daysValue', '{{count}} days', { count: sessionDays.longestRun })}
                />
                <ReportRow
                  label={t('dashboard.recap.stat.peakHour', 'Peak hour')}
                  value={formatHour(insights.peakHour?.hour)}
                  detail={insights.peakHour
                    ? t('dashboard.recap.report.messagesValue', '{{count}} messages', { count: insights.peakHour.messages })
                    : undefined}
                />
                <ReportRow
                  label={t('dashboard.recap.report.sessionDepth', 'Session depth')}
                  value={`${Math.round(insights.medianMessagesPerSession)} / ${insights.p90MessagesPerSession}`}
                  detail={t('dashboard.recap.report.medianP90', 'median / P90 messages')}
                />
              </dl>
            </section>

            <section>
              <h3 className="text-xs font-semibold text-foreground">
                {t('dashboard.recap.report.distribution', 'Work distribution')}
              </h3>
              <dl className="mt-2 divide-y divide-border/70 border-y border-border/70">
                <ReportRow
                  label={t('dashboard.recap.stat.topProject', 'Top project')}
                  value={topProject ? getPathBasename(topProject.name) : '—'}
                  detail={topProject
                    ? t('dashboard.recap.report.sessionsShare', '{{count}} sessions · {{share}}', {
                        count: topProject.sessions,
                        share: formatPercent(topProject.share),
                      })
                    : undefined}
                />
                <ReportRow
                  label={t('dashboard.recap.stat.topModel', 'Top model')}
                  value={topModel?.name || '—'}
                  detail={topModel
                    ? t('dashboard.recap.report.sessionsShare', '{{count}} sessions · {{share}}', {
                        count: topModel.sessions,
                        share: formatPercent(topModel.share),
                      })
                    : undefined}
                />
                <ReportRow
                  label={t('dashboard.recap.report.deepestSession', 'Deepest session')}
                  value={deepestName}
                  detail={deepest
                    ? t('dashboard.recap.report.messagesValue', '{{count}} messages', { count: deepest.message_count })
                    : undefined}
                  title={deepestName}
                />
                <ReportRow
                  label={t('dashboard.recap.report.cacheShare', 'Cache share')}
                  value={formatPercent(insights.cacheShare)}
                  detail={t('dashboard.recap.report.cacheShareHint', 'of measured input, output, and cache tokens')}
                />
              </dl>
            </section>
          </div>

          <p className="border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            {t('dashboard.recap.report.localOnly', 'Calculated locally from dashboard statistics. No network or model call is used.')}
          </p>
        </>
      )}
    </DashboardDialog>
  )
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold tabular-nums text-foreground" title={value}>
        {value}
      </dd>
    </div>
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
