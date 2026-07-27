import { Activity, CalendarDays, Clock3, Folder, Gauge, MessageSquare, Sparkles, Terminal, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionInfo, SessionStats } from '@/types'
import { getPathBasename } from '@/utils/path'
import DashboardDialog from './DashboardDialog'
import { deriveDashboardInsights } from './dashboardInsights'
import type { DashboardRecapRequest } from './dashboardRecap'

interface DashboardRecapModalProps {
  request: DashboardRecapRequest
  sessions: SessionInfo[]
  stats: SessionStats | null
  loading: boolean
  error: string | null
  onClose: () => void
}

function compact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatCost(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value < 1 ? 3 : 2,
  }).format(value)
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export default function DashboardRecapModal({
  request,
  sessions,
  stats,
  loading,
  error,
  onClose,
}: DashboardRecapModalProps) {
  const { t, i18n } = useTranslation()
  const insights = stats ? deriveDashboardInsights(stats, sessions, request.end) : null
  const periodLabel = new Intl.DateTimeFormat(i18n.language || undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
  const topProject = insights?.topProject
  const topModel = insights?.topModel
  const deepest = insights?.deepestSession
  const title = request.kind === 'midyear'
    ? t('dashboard.recap.midyearTitle', '{{year}} Midyear Recap', { year: request.year })
    : t('dashboard.recap.yearendTitle', '{{year}} Year in Review', { year: request.year })
  const subtitle = t(
    'dashboard.recap.period',
    '{{start}} – {{end}} · sessions are assigned by last modified time',
    { start: periodLabel.format(request.start), end: periodLabel.format(request.end) },
  )

  return (
    <DashboardDialog
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      eyebrow={(
        <span className="inline-flex items-center gap-1.5 text-primary">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {t('dashboard.recap.eyebrow', 'A quiet data easter egg')}
        </span>
      )}
      ariaLabel={title}
      className="max-w-5xl"
      bodyClassName="space-y-3"
      footer={(
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
          <span>{t('dashboard.recap.localOnly', 'Generated locally from existing dashboard statistics. No network or model call.')}</span>
          <button type="button" onClick={onClose} className="focus-ring h-8 rounded border border-border px-3 text-xs text-foreground hover:bg-muted/40">
            {t('dashboard.recap.close', 'Keep this memory')}
          </button>
        </div>
      )}
    >
      {loading ? (
        <div className="grid min-h-72 place-items-center text-sm text-muted-foreground" role="status">
          {t('dashboard.recap.loading', 'Preparing your recap...')}
        </div>
      ) : error ? (
        <div className="rounded border border-destructive/35 bg-destructive/8 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>
      ) : !stats || sessions.length === 0 || !insights ? (
        <div className="grid min-h-72 place-items-center rounded border border-dashed border-border text-center">
          <div>
            <CalendarDays className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <div className="mt-2 text-sm font-medium text-foreground">{t('dashboard.recap.emptyTitle', 'Not enough activity yet')}</div>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">{t('dashboard.recap.emptyDescription', 'This period has no sessions assigned by last modified time.')}</p>
          </div>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded border border-border bg-border md:grid-cols-4" aria-label={t('dashboard.recap.periodTotals', 'Period totals')}>
            <RecapMetric icon={Terminal} label={t('dashboard.stats.sessions', 'Sessions')} value={compact(stats.total_sessions)} />
            <RecapMetric icon={MessageSquare} label={t('dashboard.stats.messages', 'Messages')} value={compact(stats.total_messages)} />
            <RecapMetric icon={Zap} label={t('dashboard.stats.tokens', 'Tokens')} value={compact(stats.total_tokens)} />
            <RecapMetric icon={Gauge} label={t('dashboard.recap.cost', 'Cost')} value={formatCost(stats.token_details.total_cost)} />
          </section>

          <section className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded border border-border bg-card/35 p-3">
              <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
                <div>
                  <h3 className="text-sm font-medium text-foreground">{t('dashboard.recap.signatureTitle', 'Your activity signature')}</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{t('dashboard.recap.signatureHint', 'A compact profile of pace, depth, and concentration.')}</p>
                </div>
                <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <InsightRow label={t('dashboard.recap.activeDays', 'Active days')} value={compact(stats.heatmap_data.filter((point) => point.level > 0).length)} detail={t('dashboard.recap.longestStreak', 'Longest streak: {{days}}d', { days: insights.longestStreak })} />
                <InsightRow label={t('dashboard.recap.sessionDepth', 'Session depth')} value={t('dashboard.recap.medianMessages', '{{count}} median messages', { count: Math.round(insights.medianMessagesPerSession) })} detail={t('dashboard.recap.p90Messages', '90th percentile: {{count}}', { count: insights.p90MessagesPerSession })} />
                <InsightRow label={t('dashboard.recap.peakHour', 'Peak hour')} value={insights.peakHour ? `${String(insights.peakHour.hour).padStart(2, '0')}:00` : '—'} detail={insights.peakHour ? t('dashboard.recap.peakMessages', '{{count}} messages', { count: insights.peakHour.messages }) : undefined} />
                <InsightRow label={t('dashboard.recap.roleRhythm', 'Conversation rhythm')} value={`${insights.assistantUserRatio.toFixed(1)}×`} detail={t('dashboard.recap.assistantPerUser', 'assistant messages per user message')} />
              </div>
            </div>

            <div className="rounded border border-border bg-card/35 p-3">
              <h3 className="text-sm font-medium text-foreground">{t('dashboard.recap.leadingSignals', 'Leading signals')}</h3>
              <div className="mt-3 divide-y divide-border/60 border-y border-border/60">
                <SignalRow icon={Folder} label={t('dashboard.recap.topProject', 'Top project')} value={topProject ? getPathBasename(topProject.name) : '—'} meta={topProject ? `${topProject.sessions} · ${percent(topProject.share)}` : undefined} />
                <SignalRow icon={Zap} label={t('dashboard.recap.topModel', 'Top model')} value={topModel?.name || '—'} meta={topModel ? `${topModel.sessions} · ${percent(topModel.share)}` : undefined} />
                <SignalRow icon={Terminal} label={t('dashboard.recap.deepestSession', 'Deepest session')} value={deepest?.name || (deepest ? getPathBasename(deepest.cwd) : '—')} meta={deepest ? t('dashboard.recap.messagesCount', '{{count}} messages', { count: deepest.message_count }) : undefined} />
                <SignalRow icon={Clock3} label={t('dashboard.recap.cacheShare', 'Cache share')} value={percent(insights.cacheShare)} meta={t('dashboard.recap.measuredTokens', 'of measured input/output/cache tokens')} />
              </div>
            </div>
          </section>

          <section className="rounded border border-primary/25 bg-primary/5 px-3 py-2.5">
            <div className="flex gap-2.5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-medium text-foreground">{t('dashboard.recap.noteTitle', 'The small surprise')}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {buildRecapNote(t, insights)}
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </DashboardDialog>
  )
}

function RecapMetric({ icon: Icon, label, value }: { icon: typeof Terminal; label: string; value: string }) {
  return (
    <div className="bg-background px-3 py-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  )
}

function InsightRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded border border-border/70 bg-background/45 px-2.5 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
      {detail ? <div className="mt-0.5 text-[10px] text-muted-foreground">{detail}</div> : null}
    </div>
  )
}

function SignalRow({ icon: Icon, label, value, meta }: { icon: typeof Terminal; label: string; value: string; meta?: string }) {
  return (
    <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 py-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0"><div className="text-[10px] text-muted-foreground">{label}</div><div className="truncate text-xs font-medium text-foreground">{value}</div></div>
      {meta ? <div className="text-[10px] tabular-nums text-muted-foreground">{meta}</div> : null}
    </div>
  )
}

function buildRecapNote(t: ReturnType<typeof useTranslation>['t'], insights: ReturnType<typeof deriveDashboardInsights>): string {
  const hour = insights.peakHour?.hour
  const timing = hour == null
    ? t('dashboard.recap.noteTimingUnknown', 'Your work rhythm is still forming.')
    : hour < 7
      ? t('dashboard.recap.noteEarly', 'Your strongest signal appears before the day gets noisy.')
      : hour >= 22
        ? t('dashboard.recap.noteLate', 'Your strongest signal appears after most timelines go quiet.')
        : t('dashboard.recap.noteDay', 'Your strongest signal sits inside the working day.')
  const concentration = Math.max(insights.topProject?.share || 0, insights.topModel?.share || 0)
  const focus = concentration >= 0.6
    ? t('dashboard.recap.noteFocused', 'This period was unusually focused: one project or model carried most sessions.')
    : t('dashboard.recap.noteExploratory', 'This period was exploratory: activity stayed distributed instead of collapsing into one lane.')
  return `${timing} ${focus}`
}
