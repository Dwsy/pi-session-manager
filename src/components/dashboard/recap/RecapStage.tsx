import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { isTauri } from '@/transport'
import { shouldUseTauriDragRegion } from '@/utils/platformShortcuts'
import type { RecapStory, RecapText } from './recapTypes'
import RecapSceneView from './RecapSceneView'

interface RecapStageProps {
  story: RecapStory
  /** Localized period range, already formatted by the caller. */
  rangeLabel: string
  onClose: () => void
  /** Rendered in the stage footer, e.g. the share button. Optional. */
  actions?: ReactNode
}

const SCENE_HOLD_MS = 6500
/** Quotes are read, not glanced at. */
const QUOTE_HOLD_MS = 9000
const SWIPE_THRESHOLD_PX = 48
const TAP_SLOP_PX = 10
const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, [role="button"], [contenteditable="true"]'
const TEXT_ENTRY_SELECTOR = 'input, textarea, [contenteditable="true"]'

/** Keeps the scene out of the per-frame re-renders the auto-advance progress causes. */
const StageScene = memo(RecapSceneView)

const CONTROL_CLASS =
  'focus-ring flex h-7 w-7 items-center justify-center rounded border border-border/70 text-muted-foreground motion-color hover:bg-muted/30 hover:text-foreground disabled:pointer-events-none disabled:opacity-35'

export default function RecapStage({ story, rangeLabel, onClose, actions }: RecapStageProps) {
  const { t } = useTranslation()
  const reducedMotion = usePrefersReducedMotion()

  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [playing, setPlaying] = useState(false)
  const [held, setHeld] = useState(false)
  const [progress, setProgress] = useState(0)

  const progressRef = useRef(0)
  const sceneRef = useRef<HTMLDivElement>(null)
  const focusOnArrivalRef = useRef(false)
  const pointerRef = useRef<{ id: number; x: number; y: number; ignore: boolean } | null>(null)

  const total = story.scenes.length
  const scene = story.scenes[index]
  const isLast = index >= total - 1

  const goTo = useCallback(
    (target: number, focus = false) => {
      const clamped = Math.max(0, Math.min(target, total - 1))
      if (clamped === index) return
      setDirection(clamped > index ? 1 : -1)
      setIndex(clamped)
      progressRef.current = 0
      setProgress(0)
      focusOnArrivalRef.current = focus
    },
    [index, total],
  )

  // A new story is a new film: never leave the index pointing past its scenes.
  useEffect(() => {
    setIndex(0)
    setDirection(1)
    setPlaying(false)
    progressRef.current = 0
    setProgress(0)
  }, [story])

  // Only keyboard navigation moves focus; the parent dialog already traps it.
  useEffect(() => {
    if (!focusOnArrivalRef.current) return
    focusOnArrivalRef.current = false
    sceneRef.current?.focus({ preventScroll: true })
  }, [index])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest(TEXT_ENTRY_SELECTOR)) return

      const isSpace = event.key === ' ' || event.key === 'Spacebar'
      // Space belongs to a focused control before it belongs to the story.
      if (isSpace && target?.closest('button, a, [role="button"]')) return

      if (isSpace || event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault()
        goTo(index + 1, true)
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        goTo(index - 1, true)
        return
      }
      if (event.key === 'Home') {
        event.preventDefault()
        goTo(0, true)
        return
      }
      if (event.key === 'End') {
        event.preventDefault()
        goTo(total - 1, true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goTo, index, total])

  useEffect(() => {
    if (!playing || held) return
    if (isLast) {
      setPlaying(false)
      return
    }

    const hold = scene?.visual.type === 'quote' ? QUOTE_HOLD_MS : SCENE_HOLD_MS

    if (reducedMotion) {
      const timer = window.setTimeout(() => goTo(index + 1), hold)
      return () => window.clearTimeout(timer)
    }

    let frame = 0
    const startedAt = performance.now()
    const startProgress = progressRef.current
    const tick = (now: number) => {
      const value = Math.min(1, startProgress + (now - startedAt) / hold)
      progressRef.current = value
      setProgress(value)
      if (value < 1) {
        frame = requestAnimationFrame(tick)
        return
      }
      goTo(index + 1)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [goTo, held, index, isLast, playing, reducedMotion, scene])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    const ignore = Boolean(target?.closest(INTERACTIVE_SELECTOR))
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, ignore }
    if (!ignore && playing) setHeld(true)
  }

  const releasePointer = () => {
    pointerRef.current = null
    setHeld(false)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerRef.current
    const bounds = event.currentTarget.getBoundingClientRect()
    releasePointer()
    if (!start || start.id !== event.pointerId || start.ignore) return

    // A drag that left text selected is a reading gesture, not navigation.
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y

    if (Math.abs(deltaX) > SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY)) {
      goTo(index + (deltaX < 0 ? 1 : -1))
      return
    }
    if (Math.abs(deltaX) > TAP_SLOP_PX || Math.abs(deltaY) > TAP_SLOP_PX) return

    const ratio = (event.clientX - bounds.left) / Math.max(bounds.width, 1)
    if (ratio <= 1 / 3) {
      goTo(index - 1)
      return
    }
    if (ratio >= 2 / 3) goTo(index + 1)
  }

  if (!scene) return null

  const translate = (text: RecapText) => t(text.key, text.fallback, text.values)
  // Scene copy interpolates `{{period}}`, but the story carries the raw label
  // template as that value; resolve it once here so scenes never print `{{month}}`.
  const periodLabel = translate(story.period.label)
  const hue = ((Math.round(story.accentHue) % 360) + 360) % 360
  const canAutoAdvance = total > 1 && !isLast
  // The stage covers the window titlebar, so the topbar has to hand dragging back.
  const dragRegion = isTauri() && shouldUseTauriDragRegion() ? { 'data-tauri-drag-region': true } : {}

  return (
    <div
      className="recap-stage"
      style={{ '--recap-hue': String(hue) } as CSSProperties}
      data-tone={scene.tone}
      role="group"
      aria-roledescription="carousel"
      aria-label={t('dashboard.recap.stageLabel', 'Recap story')}
    >
      <div className="recap-ambient" aria-hidden="true">
        <span className="recap-ambient__blob recap-ambient__blob--a" />
        <span className="recap-ambient__blob recap-ambient__blob--b" />
        <span className="recap-ambient__grain" />
        <span className="recap-ambient__vignette" />
      </div>

      <div
        className="recap-progress"
        role="group"
        aria-label={t('dashboard.recap.progressLabel', 'Scene {{current}} of {{total}}', {
          current: index + 1,
          total,
        })}
      >
        {story.scenes.map((item, position) => {
          // The current segment keeps the paused progress instead of snapping
          // full, so pausing visibly holds the story where it stopped.
          const fill =
            position < index
              ? 1
              : position > index
                ? 0
                : reducedMotion
                  ? 1
                  : playing || progress > 0
                    ? progress
                    : 1
          return (
            <button
              key={item.id}
              type="button"
              className={`recap-progress__segment${position === index ? ' is-current' : ''}`}
              aria-label={t('dashboard.recap.goToScene', 'Go to scene {{index}}', { index: position + 1 })}
              aria-current={position === index ? 'true' : undefined}
              onClick={() => goTo(position)}
            >
              <span className="recap-progress__track">
                <span className="recap-progress__fill" style={{ transform: `scaleX(${fill})` }} />
              </span>
            </button>
          )
        })}
      </div>

      <header className="recap-stage__topbar">
        <div className="min-w-0">
          <div className="recap-stage__eyebrow">{t('dashboard.recap.eyebrow', 'Recap')}</div>
          <div className="recap-stage__period">
            <span className="truncate font-medium text-foreground">{periodLabel}</span>
            <span className="recap-stage__range">{rangeLabel}</span>
          </div>
        </div>
        <div className="recap-stage__drag" {...dragRegion} />
        <div className="flex shrink-0 items-center gap-1.5">
          {total > 1 ? (
            <button
              type="button"
              className={CONTROL_CLASS}
              onClick={() => setPlaying((current) => !current)}
              disabled={!playing && !canAutoAdvance}
              aria-pressed={playing}
              aria-label={playing
                ? t('dashboard.recap.pause', 'Pause auto-advance')
                : t('dashboard.recap.play', 'Play automatically')}
            >
              {playing
                ? <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          ) : null}
          <button
            type="button"
            className={CONTROL_CLASS}
            onClick={onClose}
            aria-label={t('dashboard.recap.close', 'Close recap')}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div
        className="recap-stage__surface"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={releasePointer}
        onPointerLeave={releasePointer}
      >
        <div className="recap-stage__live" aria-live="polite" aria-atomic="true">
          <div
            key={`${index}-${scene.id}`}
            ref={sceneRef}
            tabIndex={-1}
            className={`recap-scene-shell${direction < 0 ? ' recap-scene-shell--back' : ''}${reducedMotion ? ' is-still' : ''}`}
          >
            <StageScene scene={scene} index={index} reducedMotion={reducedMotion} periodLabel={periodLabel} />
          </div>
        </div>
      </div>

      <footer className="recap-stage__footer">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={CONTROL_CLASS}
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label={t('dashboard.recap.previous', 'Previous scene')}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={CONTROL_CLASS}
            onClick={() => goTo(index + 1)}
            disabled={isLast}
            aria-label={t('dashboard.recap.next', 'Next scene')}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="recap-stage__counter" aria-hidden="true">
            {index + 1} / {total}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isLast && total > 1 ? (
            <button
              type="button"
              className="recap-stage__restart focus-ring motion-color"
              onClick={() => {
                setPlaying(false)
                goTo(0)
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {t('dashboard.recap.restart', 'Start over')}
            </button>
          ) : null}
          {/* The summary scene is what the export renders, so promote the button there. */}
          <div className={`recap-stage__actions${scene.id === 'summary' ? ' is-primary' : ''}`}>
            {actions}
          </div>
        </div>
      </footer>
    </div>
  )
}
