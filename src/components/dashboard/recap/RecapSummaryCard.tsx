import { useTranslation } from 'react-i18next'
import {
  Bot,
  Boxes,
  CalendarDays,
  Clock,
  Coins,
  Cpu,
  DatabaseZap,
  Flame,
  Gauge,
  Hash,
  MessagesSquare,
  Sigma,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import RecapCountUp from './RecapCountUp'
import type { RecapMoment, RecapStat, RecapStatIcon, RecapText, RecapVisual } from './recapTypes'

/**
 * The two faces of the period summary.
 *
 * `RecapOverviewStrip` opens the story with the four numbers that define it;
 * `RecapSummaryGrid` closes it with everything, laid out as the card the
 * image export mirrors. Both read stats the composer derived once, so the
 * cover, the finale, and the PNG can never disagree.
 */

type StatsVisual = Extract<RecapVisual, { type: 'overview' }>
type SummaryVisual = Extract<RecapVisual, { type: 'summaryGrid' }>

const STAT_ICONS: Record<RecapStatIcon, LucideIcon> = {
  sessions: Boxes,
  messages: MessagesSquare,
  tokens: Hash,
  cost: Coins,
  days: CalendarDays,
  streak: Flame,
  clock: Clock,
  project: Sigma,
  model: Cpu,
  cache: DatabaseZap,
  average: Gauge,
  subagent: Bot,
}

function useTranslateText() {
  const { t } = useTranslation()
  return (text: RecapText) => t(text.key, text.fallback, text.values)
}

function StatValue({ stat, reducedMotion }: { stat: RecapStat; reducedMotion: boolean }) {
  if (typeof stat.value === 'number') {
    return <RecapCountUp value={stat.value} display={stat.display} reducedMotion={reducedMotion} />
  }
  return <span className="truncate">{stat.display ?? stat.value}</span>
}

function HeadlineTile({ stat, reducedMotion }: { stat: RecapStat; reducedMotion: boolean }) {
  const translate = useTranslateText()
  const Icon = STAT_ICONS[stat.icon]

  return (
    <div className="recap-tile">
      <span className="recap-tile__icon">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="recap-tile__value">
        <StatValue stat={stat} reducedMotion={reducedMotion} />
      </span>
      <span className="recap-tile__label">{translate(stat.label)}</span>
      {stat.hint ? <span className="recap-tile__hint">{translate(stat.hint)}</span> : null}
    </div>
  )
}

function DetailRow({ stat }: { stat: RecapStat }) {
  const translate = useTranslateText()
  const Icon = STAT_ICONS[stat.icon]
  const value =
    stat.display ?? (typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value)

  return (
    <div className="recap-detail">
      <span className="recap-detail__icon">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="recap-detail__label">{translate(stat.label)}</span>
        <span className="recap-detail__value" title={String(value)}>
          {value}
        </span>
        {stat.hint ? <span className="recap-detail__hint">{translate(stat.hint)}</span> : null}
      </span>
    </div>
  )
}

/** A thin bar per day, so the cover shows the period's shape at a glance. */
function PulseStrip({ pulse }: { pulse: number[] }) {
  const { t } = useTranslation()
  if (pulse.length === 0) return null

  return (
    <div
      className="recap-pulse"
      role="img"
      aria-label={t('dashboard.recap.visual.pulseLabel', 'Daily activity across the period')}
    >
      {pulse.map((raw, index) => {
        const normalized = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0))
        return (
          <span
            key={index}
            className="recap-pulse__bar"
            style={{ height: `${8 + normalized * 92}%`, opacity: 0.28 + normalized * 0.72 }}
          />
        )
      })}
    </div>
  )
}

export function RecapOverviewStrip({ visual }: { visual: StatsVisual }) {
  const reducedMotion = usePrefersReducedMotion()
  if (visual.stats.length === 0) return null

  return (
    <div className="recap-overview">
      <div className="recap-overview__tiles">
        {visual.stats.map((stat) => (
          <HeadlineTile key={stat.key} stat={stat} reducedMotion={reducedMotion} />
        ))}
      </div>
      <PulseStrip pulse={visual.pulse} />
    </div>
  )
}

function MomentChips({ moments }: { moments: RecapMoment[] }) {
  const { t } = useTranslation()
  const translate = useTranslateText()
  if (moments.length === 0) return null

  return (
    <div className="recap-summary-card__moments">
      <span className="recap-summary-card__heading">
        {t('dashboard.recap.summaryCard.momentsHeading', 'Moments earned')}
      </span>
      <ul className="recap-chips">
        {moments.map((moment) => (
          <li key={moment.id} className={`recap-chip recap-chip--${moment.rarity}`}>
            {translate(moment.title)}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RecapSummaryGrid({ visual }: { visual: SummaryVisual }) {
  const { t } = useTranslation()
  const reducedMotion = usePrefersReducedMotion()
  if (visual.headline.length === 0) return null

  return (
    <section
      className="recap-summary-card"
      aria-label={t('dashboard.recap.visual.summaryLabel', 'Everything from this period')}
    >
      <div className="recap-overview__tiles">
        {visual.headline.map((stat) => (
          <HeadlineTile key={stat.key} stat={stat} reducedMotion={reducedMotion} />
        ))}
      </div>

      {visual.detail.length > 0 ? (
        <div className="recap-summary-card__details">
          {visual.detail.map((stat) => (
            <DetailRow key={stat.key} stat={stat} />
          ))}
        </div>
      ) : null}

      <MomentChips moments={visual.moments} />
    </section>
  )
}
