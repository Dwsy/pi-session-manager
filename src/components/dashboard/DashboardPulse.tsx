import { Activity, BarChart3, Clock3, Coins, DollarSign, Gauge, Layers3, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import DashboardCardShell from './DashboardCardShell'
import type { DashboardInsights } from './dashboardInsights'

interface PulsePrimary {
  label: string
  value: string
  detail: string
}

interface ComparisonMetric {
  key: 'sessions' | 'messages' | 'tokens' | 'cost'
  label: string
  value: string
  previous: string
  change: string
  onClick: () => void
}

interface DashboardPulseProps {
  insights: DashboardInsights
  primary: PulsePrimary
  comparison?: {
    periodLabel: string
    previousLabel: string
    metrics: ComparisonMetric[]
  } | null
  onOpenSessions: () => void
  onOpenActivity: () => void
}

const COMPARISON_ICONS = {
  sessions: BarChart3,
  messages: MessageSquare,
  tokens: Coins,
  cost: DollarSign,
} as const

export default function DashboardPulse({ insights, primary, comparison, onOpenSessions, onOpenActivity }: DashboardPulseProps) {
  const { t } = useTranslation()
  const concentration = Math.max(insights.topProject?.share || 0, insights.topModel?.share || 0)

  if (comparison) {
    return (
      <DashboardCardShell className="p-0">
        <div className="grid grid-cols-2 gap-px bg-border/60 lg:grid-cols-4" aria-label={comparison.periodLabel}>
          {comparison.metrics.map((metric) => {
            const Icon = COMPARISON_ICONS[metric.key]
            return (
              <button key={metric.key} type="button" onClick={metric.onClick} className="focus-ring grid min-h-[72px] grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2 bg-background px-3 py-2.5 text-left hover:bg-muted/25">
                <Icon className="mt-0.5 h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-[10px] font-medium text-foreground">{metric.label}</span>
                  <span className="mt-1 block truncate text-[9px] text-muted-foreground">{comparison.previousLabel}: {metric.previous}</span>
                </span>
                <span className="text-right">
                  <strong className="block text-sm font-semibold tabular-nums text-foreground">{metric.value}</strong>
                  <span className="mt-1 block text-[9px] font-medium tabular-nums text-foreground">{metric.change}</span>
                </span>
              </button>
            )
          })}
        </div>
      </DashboardCardShell>
    )
  }

  return (
    <DashboardCardShell className="p-0">
      <div className="grid grid-cols-2 gap-px bg-border/60 lg:grid-cols-4" aria-label={t('dashboard.pulse.selectedScopeTitle', 'Selected-range pulse')}>
        <PulseItem icon={Activity} label={primary.label} value={primary.value} detail={primary.detail} onClick={onOpenActivity} />
        <PulseItem icon={Clock3} label={t('dashboard.pulse.rangeStreak', 'Range streak')} value={t('dashboard.pulse.days', '{{count}}d', { count: insights.currentStreak })} detail={t('dashboard.pulse.longest', 'longest {{count}}d', { count: insights.longestStreak })} onClick={onOpenActivity} />
        <PulseItem icon={Layers3} label={t('dashboard.pulse.rangeDepth', 'Range session depth')} value={Math.round(insights.medianMessagesPerSession).toLocaleString()} detail={t('dashboard.pulse.depthDetail', 'median · p90 {{count}} msgs', { count: insights.p90MessagesPerSession })} onClick={onOpenSessions} />
        <PulseItem icon={Gauge} label={t('dashboard.pulse.rangeConcentration', 'Range concentration')} value={`${Math.round(concentration * 100)}%`} detail={concentration >= 0.6 ? t('dashboard.pulse.focused', 'one lane dominates sessions') : t('dashboard.pulse.distributed', 'activity remains distributed')} onClick={onOpenSessions} />
      </div>
    </DashboardCardShell>
  )
}

function PulseItem({ icon: Icon, label, value, detail, onClick }: { icon: typeof Activity; label: string; value: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="focus-ring grid min-h-[68px] grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2 bg-background px-3 py-2.5 text-left hover:bg-muted/25">
      <Icon className="mt-0.5 h-3.5 w-3.5 text-primary" aria-hidden="true" />
      <span className="min-w-0"><span className="block text-[10px] font-medium text-foreground">{label}</span><span className="mt-1 block truncate text-[9px] text-muted-foreground">{detail}</span></span>
      <strong className="text-sm font-semibold tabular-nums text-foreground">{value}</strong>
    </button>
  )
}
