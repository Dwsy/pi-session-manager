import { useTranslation } from 'react-i18next'
import type { CSSProperties } from 'react'
import type { RecapMetric, RecapScene, RecapText, RecapVisual } from './recapTypes'
import RecapCountUp from './RecapCountUp'
import { RecapVisualView } from './RecapVisuals'

interface RecapSceneViewProps {
  scene: RecapScene
  /** Index within the story, used to stagger reveals. */
  index: number
  reducedMotion: boolean
  /**
   * Resolved period label. The story passes the raw label template as the
   * `period` interpolation value, and i18next only interpolates one pass, so
   * the stage resolves it and scenes substitute it here.
   */
  periodLabel?: string
}

const REVEAL_STEP_MS = 60

const METRIC_GRID: Record<number, string> = {
  1: 'recap-scene__metrics--single grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
}

/** Visuals narrow enough to sit beside the copy rather than under it. */
const SPLIT_VISUALS: ReadonlySet<RecapVisual['type']> = new Set([
  'clockDial',
  'sparkline',
  'streakRibbon',
  'quote',
])

export default function RecapSceneView({ scene, index, reducedMotion, periodLabel }: RecapSceneViewProps) {
  const { t } = useTranslation()
  const translate = (text: RecapText) => {
    const values =
      periodLabel && text.values && 'period' in text.values
        ? { ...text.values, period: periodLabel }
        : text.values
    return t(text.key, text.fallback, values)
  }

  const revealClass = reducedMotion ? '' : 'recap-reveal'
  const revealStyle = (order: number): CSSProperties | undefined =>
    reducedMotion ? undefined : { animationDelay: `${order * REVEAL_STEP_MS}ms` }

  // More than three metrics stops reading as a headline.
  const metrics = scene.metrics.slice(0, 3)
  const hasVisual = scene.visual.type !== 'none'
  const split = hasVisual && SPLIT_VISUALS.has(scene.visual.type)
  // A lone metric centers under full-width copy, but must stay left-aligned
  // beside a visual or it drifts away from the text it belongs to.
  const metricAlignment = metrics.length === 1 && !split ? ' justify-items-center text-center' : ''

  const visual = hasVisual ? (
    <div className={`recap-scene__visual ${revealClass}`} style={revealStyle(4)}>
      <RecapVisualView visual={scene.visual} />
    </div>
  ) : null

  return (
    <article className="recap-scene" data-scene-index={index}>
      <div className={`recap-scene__content${split ? ' recap-scene__content--split' : ''}`}>
        <div className="flex min-w-0 flex-col gap-5">
          <p className={`recap-scene__eyebrow ${revealClass}`} style={revealStyle(0)}>
            {translate(scene.eyebrow)}
          </p>

          <h3 className={`recap-scene__title ${revealClass}`} style={revealStyle(1)}>
            {translate(scene.title)}
          </h3>

          {metrics.length > 0 ? (
            <div
              className={`recap-scene__metrics grid gap-4 ${METRIC_GRID[metrics.length] ?? METRIC_GRID[3]}${metricAlignment} ${revealClass}`}
              style={revealStyle(2)}
            >
              {metrics.map((metric) => (
                <Metric key={metric.key} metric={metric} reducedMotion={reducedMotion} translate={translate} />
              ))}
            </div>
          ) : null}

          {scene.body ? (
            <p className={`recap-scene__body ${revealClass}`} style={revealStyle(3)}>
              {translate(scene.body)}
            </p>
          ) : null}

          {split ? null : visual}

          {scene.footnote ? (
            <p className={`recap-scene__footnote ${revealClass}`} style={revealStyle(5)}>
              {translate(scene.footnote)}
            </p>
          ) : null}
        </div>

        {split ? visual : null}
      </div>
    </article>
  )
}

interface MetricProps {
  metric: RecapMetric
  reducedMotion: boolean
  translate: (text: RecapText) => string
}

function Metric({ metric, reducedMotion, translate }: MetricProps) {
  return (
    <div className="recap-metric min-w-0">
      <div className="recap-metric__value">
        {typeof metric.value === 'number' ? (
          <RecapCountUp value={metric.value} display={metric.display} reducedMotion={reducedMotion} />
        ) : (
          <span>{metric.display ?? metric.value}</span>
        )}
        {metric.unit ? <span className="recap-metric__unit">{translate(metric.unit)}</span> : null}
      </div>
      <div className="recap-metric__label">{translate(metric.label)}</div>
    </div>
  )
}
