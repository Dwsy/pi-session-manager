import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Anchor,
  Clover,
  Compass,
  Flame,
  Ghost,
  Heart,
  Infinity as InfinityIcon,
  Moon,
  Mountain,
  Sparkles,
  Sunrise,
  Trophy,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { RecapOverviewStrip, RecapSummaryGrid } from './RecapSummaryCard'
import type { RecapMomentIcon, RecapMomentRarity, RecapText, RecapVisual } from './recapTypes'

type StreakRibbonVisual = Extract<RecapVisual, { type: 'streakRibbon' }>
type ClockDialVisual = Extract<RecapVisual, { type: 'clockDial' }>
type SparklineVisual = Extract<RecapVisual, { type: 'sparkline' }>
type QuoteVisual = Extract<RecapVisual, { type: 'quote' }>
type MomentsVisual = Extract<RecapVisual, { type: 'moments' }>

const MOMENT_ICONS: Record<RecapMomentIcon, LucideIcon> = {
  moon: Moon,
  sunrise: Sunrise,
  flame: Flame,
  infinity: InfinityIcon,
  compass: Compass,
  anchor: Anchor,
  sparkles: Sparkles,
  trophy: Trophy,
  heart: Heart,
  mountain: Mountain,
  clover: Clover,
  ghost: Ghost,
}

const DIAL = {
  size: 200,
  center: 100,
  inner: 34,
  outer: 88,
  /** Breathing room so the hour ticks are not clipped by the viewBox edge. */
  pad: 14,
}

const SPARK = {
  width: 240,
  height: 72,
  padding: 6,
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

/** Catmull-Rom control points turned into cubic segments, so the line reads smooth without a chart library. */
function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  const round = (value: number) => value.toFixed(2)
  if (points.length === 1) return `M ${round(points[0].x)} ${round(points[0].y)}`

  let path = `M ${round(points[0].x)} ${round(points[0].y)}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]
    const start = points[index]
    const end = points[index + 1]
    const next = points[index + 2] ?? end
    const c1x = start.x + (end.x - previous.x) / 6
    const c1y = start.y + (end.y - previous.y) / 6
    const c2x = end.x - (next.x - start.x) / 6
    const c2y = end.y - (next.y - start.y) / 6
    path += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(end.x)} ${round(end.y)}`
  }
  return path
}

export function RecapStreakRibbon({ visual }: { visual: StreakRibbonVisual }) {
  const { t } = useTranslation()
  if (visual.days.length === 0) return null

  const activeCount = visual.days.filter(Boolean).length
  const caption = visual.activeLabel
    ? t(visual.activeLabel.key, visual.activeLabel.fallback, visual.activeLabel.values)
    : t('dashboard.recap.visual.activeDays', '{{count}} active days', { count: activeCount })

  return (
    <figure className="recap-ribbon">
      <div
        className="recap-ribbon__cells"
        role="img"
        aria-label={t('dashboard.recap.visual.ribbonLabel', 'Daily activity across the period')}
      >
        {visual.days.map((active, position) => (
          <span
            key={position}
            className={`recap-ribbon__cell${active ? ' is-active' : ''}`}
          />
        ))}
      </div>
      <figcaption className="recap-ribbon__caption">{caption}</figcaption>
    </figure>
  )
}

export function RecapClockDial({ visual }: { visual: ClockDialVisual }) {
  const { t } = useTranslation()
  const hours = visual.hours.slice(0, 24)
  if (hours.length === 0) return null

  const peakHour = Math.min(23, Math.max(0, Math.round(visual.peakHour)))
  const span = DIAL.outer - DIAL.inner

  return (
    <figure className="recap-dial">
      <svg
        className="recap-dial__svg"
        viewBox={`${-DIAL.pad} ${-DIAL.pad} ${DIAL.size + DIAL.pad * 2} ${DIAL.size + DIAL.pad * 2}`}
        role="img"
        aria-label={t('dashboard.recap.visual.dialLabel', 'Activity by hour of day, peaking at {{hour}}', {
          hour: formatHour(peakHour),
        })}
      >
        <circle
          cx={DIAL.center}
          cy={DIAL.center}
          r={DIAL.outer}
          fill="none"
          stroke="rgb(var(--color-muted-foreground) / 0.14)"
          strokeWidth="1"
        />
        {hours.map((raw, hour) => {
          const normalized = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0))
          const radians = ((hour / 24) * 360 - 90) * (Math.PI / 180)
          const length = DIAL.inner + 4 + normalized * (span - 4)
          const isPeak = hour === peakHour
          return (
            <line
              key={hour}
              x1={DIAL.center + Math.cos(radians) * DIAL.inner}
              y1={DIAL.center + Math.sin(radians) * DIAL.inner}
              x2={DIAL.center + Math.cos(radians) * length}
              y2={DIAL.center + Math.sin(radians) * length}
              stroke={isPeak ? 'var(--recap-accent-strong)' : 'var(--recap-accent)'}
              strokeOpacity={isPeak ? 1 : 0.22 + normalized * 0.5}
              strokeWidth={isPeak ? 8 : 6}
              strokeLinecap="round"
            />
          )
        })}
        {[0, 6, 12, 18].map((hour) => {
          const radians = ((hour / 24) * 360 - 90) * (Math.PI / 180)
          return (
            <text
              key={hour}
              className="recap-dial__tick"
              x={DIAL.center + Math.cos(radians) * (DIAL.outer + 8)}
              y={DIAL.center + Math.sin(radians) * (DIAL.outer + 8)}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {hour}
            </text>
          )
        })}
        <text
          className="recap-dial__peak"
          x={DIAL.center}
          y={DIAL.center}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {formatHour(peakHour)}
        </text>
      </svg>
      <figcaption className="recap-dial__caption">
        {t('dashboard.recap.visual.peakHour', 'peak hour')}
      </figcaption>
    </figure>
  )
}

export function RecapSparkline({ visual }: { visual: SparklineVisual }) {
  const { t } = useTranslation()
  // `useId` emits colons, which are awkward inside `url(#...)` references.
  const gradientId = `recap-spark-${useId().replace(/:/g, '')}`
  if (visual.points.length === 0) return null

  const usable = SPARK.height - SPARK.padding * 2
  const lastIndex = Math.max(visual.points.length - 1, 1)
  const coordinates = visual.points.map((raw, index) => {
    const normalized = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0))
    return {
      x: (index / lastIndex) * SPARK.width,
      y: SPARK.padding + (1 - normalized) * usable,
      value: normalized,
    }
  })

  const peak = coordinates.reduce((best, point) => (point.value > best.value ? point : best), coordinates[0])
  const line = smoothPath(coordinates)
  const area = coordinates.length > 1
    ? `${line} L ${SPARK.width} ${SPARK.height} L 0 ${SPARK.height} Z`
    : null

  return (
    <figure className="recap-spark">
      <svg
        className="recap-spark__svg"
        viewBox={`0 0 ${SPARK.width} ${SPARK.height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t('dashboard.recap.visual.sparklineLabel', 'Activity trend across the period')}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--recap-accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--recap-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {area ? <path d={area} fill={`url(#${gradientId})`} /> : null}
        <path
          d={line}
          fill="none"
          stroke="var(--recap-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* The svg stretches non-uniformly, so the peak marker lives in HTML to stay a circle. */}
      <span
        className="recap-spark__peak"
        style={{
          left: `${(peak.x / SPARK.width) * 100}%`,
          top: `${(peak.y / SPARK.height) * 100}%`,
        }}
        aria-hidden="true"
      />
    </figure>
  )
}

export function RecapQuote({ visual }: { visual: QuoteVisual }) {
  const { t } = useTranslation()
  const text = visual.text.trim()
  if (!text) return null

  const caption = visual.caption
    ? t(visual.caption.key, visual.caption.fallback, visual.caption.values)
    : null

  return (
    <figure className="recap-quote" aria-label={t('dashboard.recap.visual.quoteLabel', 'Your own words')}>
      <blockquote className="recap-quote__text">{text}</blockquote>
      {caption ? <figcaption className="recap-quote__caption">{caption}</figcaption> : null}
    </figure>
  )
}

export function RecapMoments({ visual }: { visual: MomentsVisual }) {
  const { t } = useTranslation()
  if (visual.moments.length === 0) return null

  const rarityLabel = (rarity: RecapMomentRarity): string => {
    if (rarity === 'legendary') return t('dashboard.recap.rarity.legendary', 'Legendary')
    if (rarity === 'rare') return t('dashboard.recap.rarity.rare', 'Rare')
    return t('dashboard.recap.rarity.common', 'Common')
  }

  const translate = (text: RecapText) => t(text.key, text.fallback, text.values)

  return (
    <ul className="recap-moments" aria-label={t('dashboard.recap.visual.momentsLabel', 'Moments earned')}>
      {visual.moments.map((moment) => {
        const Icon = MOMENT_ICONS[moment.icon] ?? Sparkles
        const title = translate(moment.title)
        return (
          <li key={moment.id} className={`recap-moment recap-moment--${moment.rarity}`}>
            <span className="recap-moment__icon">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="recap-moment__title">
                {title}
                {/* Rarity is carried by the card treatment, so it is spelled out for assistive tech only. */}
                <span className="sr-only"> · {rarityLabel(moment.rarity)}</span>
              </span>
              <span className="recap-moment__detail">{translate(moment.detail)}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function RecapVisualView({ visual }: { visual: RecapVisual }) {
  switch (visual.type) {
    case 'streakRibbon':
      return <RecapStreakRibbon visual={visual} />
    case 'clockDial':
      return <RecapClockDial visual={visual} />
    case 'sparkline':
      return <RecapSparkline visual={visual} />
    case 'quote':
      return <RecapQuote visual={visual} />
    case 'moments':
      return <RecapMoments visual={visual} />
    case 'overview':
      return <RecapOverviewStrip visual={visual} />
    case 'summaryGrid':
      return <RecapSummaryGrid visual={visual} />
    case 'none':
    default:
      return null
  }
}
