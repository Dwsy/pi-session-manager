import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { SessionInfo, SessionStats } from '@/types'
import RecapStage from './recap/RecapStage'
import RecapShareCard from './recap/RecapShareCard'
import { buildRecapStory } from './recap/recapStory'
import { formatRecapRange } from './recap/recapPeriods'
import type { DashboardRecapRequest } from './dashboardRecap'

interface DashboardRecapModalProps {
  request: DashboardRecapRequest
  /** Sessions inside the requested period. */
  sessions: SessionInfo[]
  /** Every session, for lifetime comparisons in the closing scene. */
  allSessions: SessionInfo[]
  stats: SessionStats | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onClose: () => void
}

/**
 * Full-screen host for the recap stage. The stage brings its own topbar,
 * progress rail, and close button, so this layer only supplies the backdrop,
 * focus containment, and the loading/error states that precede a story.
 */
export default function DashboardRecapModal({
  request,
  sessions,
  allSessions,
  stats,
  loading,
  error,
  onRetry,
  onClose,
}: DashboardRecapModalProps) {
  const { t, i18n } = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => dialogRef.current?.focus())

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const elements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('hidden'))
      if (elements.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    }
  }, [onClose])

  const story = useMemo(() => {
    if (sessions.length === 0) {
      // The composer renders a considered empty story without stats.
      return buildRecapStory({
        period: request.period,
        sessions: [],
        allSessions,
        stats: emptyStats(),
        now: new Date(),
      })
    }
    if (!stats) return null
    return buildRecapStory({
      period: request.period,
      sessions,
      allSessions,
      stats,
      now: new Date(),
    })
  }, [allSessions, request.period, sessions, stats])

  const rangeLabel = formatRecapRange(request.period, i18n.language || undefined)
  const periodTitle = t(request.period.label.key, request.period.label.fallback, request.period.label.values)

  return createPortal(
    <div className="recap-backdrop fixed inset-0 z-[560]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('dashboard.recap.dialogLabel', '{{period}} recap', { period: periodTitle })}
        tabIndex={-1}
        className="recap-shell absolute inset-0 flex flex-col outline-none"
      >
        {loading ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground" role="status">
            {t('dashboard.recap.loading', 'Preparing your recap...')}
          </div>
        ) : error ? (
          <div className="grid flex-1 place-items-center">
            <div className="max-w-md text-center">
              <div className="rounded border border-destructive/35 bg-destructive/8 px-4 py-3 text-sm text-destructive" role="alert">
                {error}
              </div>
              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={onRetry}
                  className="focus-ring h-8 rounded border border-border px-3 text-xs text-foreground hover:bg-muted/40"
                >
                  {t('dashboard.recap.retry', 'Try again')}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="focus-ring h-8 rounded border border-border px-3 text-xs text-muted-foreground hover:bg-muted/40"
                >
                  {t('dashboard.recap.close', 'Close recap')}
                </button>
              </div>
            </div>
          </div>
        ) : story ? (
          <RecapStage
            story={story}
            rangeLabel={rangeLabel}
            onClose={onClose}
            actions={
              story.isEmpty ? undefined : (
                <RecapShareCard story={story} rangeLabel={rangeLabel} title={periodTitle} />
              )
            }
          />
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

function emptyStats(): SessionStats {
  return {
    total_sessions: 0,
    total_messages: 0,
    user_messages: 0,
    assistant_messages: 0,
    total_tokens: 0,
    sessions_by_project: {},
    sessions_by_model: {},
    model_usage_by_project: {},
    messages_by_date: {},
    messages_by_hour: {},
    messages_by_day_of_week: {},
    average_messages_per_session: 0,
    heatmap_data: [],
    time_distribution: [],
    token_details: {
      total_input: 0,
      total_output: 0,
      total_cache_read: 0,
      total_cache_write: 0,
      total_cost: 0,
      tokens_by_model: {},
    },
  }
}
