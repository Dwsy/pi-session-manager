import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import {
  X,
  MessageSquare,
  Terminal,
  Zap,
  Folder,
  Clock,
  ArrowUpRight,
  ChevronRight,
} from 'lucide-react'
import type { HeatmapPoint, DayStats } from '@/types'
import { getPathBasename } from '@/utils/path'

interface HeatmapDayModalProps {
  point: HeatmapPoint
  onClose: () => void
  dayStats?: DayStats
  loading?: boolean
  onFilterProject?: (projectPathOrName: string) => void
  onOpenSession?: (sessionPath: string) => void
  tokenTrend?: HeatmapPoint[]
}

const ACTIVITY_CONFIG = [
  { label: 'dashboard.activityLevels.none', color: '#1a1b26' },
  { label: 'dashboard.activityLevels.low', color: '#0d4436' },
  { label: 'dashboard.activityLevels.low', color: '#1b6e54' },
  { label: 'dashboard.activityLevels.medium', color: '#2e9973' },
  { label: 'dashboard.activityLevels.high', color: '#46c492' },
  { label: 'dashboard.activityLevels.veryHigh', color: '#6eebb1' },
]

function formatCompactNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`
  return value.toString()
}

function hexToRgba(hex: string, alpha: number): string {
  const sanitized = hex.replace('#', '')
  const normalized = sanitized.length === 3
    ? sanitized.split('').map((ch) => ch + ch).join('')
    : sanitized
  const int = Number.parseInt(normalized, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function intensity(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0
  const scaled = Math.log10(value + 1) / Math.log10(max + 1)
  return Math.min(1, Math.max(0, scaled))
}

function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) return hexToRgba(color, alpha)
  if (color.startsWith('hsl(')) return color.replace(')', ` / ${alpha})`)
  return color
}

function metricColor(scale: number): string {
  const clamped = Math.max(0, Math.min(1, scale))
  const hue = 215 - clamped * 95
  const saturation = 52
  const lightness = 48
  return `hsl(${hue} ${saturation}% ${lightness}%)`
}

type FocusPanel = 'projects' | 'sessions' | null

export default function HeatmapDayModal({
  point,
  onClose,
  dayStats,
  loading = false,
  onFilterProject,
  onOpenSession,
  tokenTrend,
}: HeatmapDayModalProps) {
  const { t, i18n } = useTranslation()

  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [focusPanel, setFocusPanel] = useState<FocusPanel>(null)
  const [hoveredTrendDate, setHoveredTrendDate] = useState<string | null>(null)

  const projectsRef = useRef<HTMLDivElement>(null)
  const sessionsRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    setSelectedHour(null)
    setFocusPanel(null)
    setHoveredTrendDate(null)
  }, [point.date])

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  const formattedDate = new Intl.DateTimeFormat(i18n.language || undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  }).format(parseISO(point.date))
  const activityConfig = ACTIVITY_CONFIG[point.level] || ACTIVITY_CONFIG[0]

  const stats = dayStats || {
    date: point.date,
    total_messages: point.total_messages,
    total_tokens: point.total_tokens,
    session_count: point.session_count,
    project_count: point.top_project ? 1 : 0,
    project_breakdown: point.top_project
      ? [{
          project_path: '',
          project_name: point.top_project,
          session_count: point.session_count,
          message_count: point.total_messages,
          token_count: point.total_tokens,
        }]
      : [],
    sessions: [],
    hourly_distribution: Array(24).fill(0),
    models_used: {},
    token_details: {
      total_input: point.total_tokens,
      total_output: 0,
      total_cache_read: 0,
      total_cache_write: 0,
      total_cost: point.total_cost,
      tokens_by_model: {},
    },
  }

  const hasDetailedStats = Boolean(dayStats)
  const hasProjects = stats.project_breakdown.length > 0
  const hasSessions = stats.sessions.length > 0

  const hourlyData = stats.hourly_distribution.map((count, hour) => ({ hour, count }))
  const maxHourly = Math.max(...stats.hourly_distribution, 0)
  const hasHourlyData = maxHourly > 0

  const peakHour = hourlyData.reduce(
    (best, item) => (item.count > best.count ? item : best),
    { hour: 0, count: 0 },
  )

  const activeHours = hourlyData.filter((item) => item.count > 0).length

  const daySummary = hasDetailedStats
    ? t(
        'dashboard.heatmapModal.daySummary',
        '{{sessions}} sessions across {{projects}} projects · peak at {{hour}}:00',
        {
          sessions: formatCompactNumber(stats.session_count),
          projects: formatCompactNumber(stats.project_count),
          hour: peakHour.hour.toString().padStart(2, '0'),
        },
      )
    : t(
        'dashboard.heatmapModal.lightweightSummary',
        '{{sessions}} sessions · detailed project, hourly, and session lists are not loaded',
        { sessions: formatCompactNumber(stats.session_count) },
      )

  const filteredSessions = useMemo(() => {
    if (selectedHour === null) return stats.sessions
    return stats.sessions.filter((session) => {
      const parsed = parseISO(session.timestamp)
      return Number.isNaN(parsed.getTime()) ? false : parsed.getHours() === selectedHour
    })
  }, [selectedHour, stats.sessions])

  const maxSessionMessages = useMemo(
    () => Math.max(...stats.sessions.map((session) => session.message_count), 1),
    [stats.sessions],
  )

  const topProjects = useMemo(
    () => stats.project_breakdown.slice(0, 4),
    [stats.project_breakdown],
  )

  const modelRows = useMemo(
    () => Object.entries(stats.models_used)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5),
    [stats.models_used],
  )

  const modelTotal = modelRows.reduce((sum, [, count]) => sum + count, 0)
  const tokenDetails = stats.token_details
  const cacheTokens = tokenDetails.total_cache_read + tokenDetails.total_cache_write
  const formatCost = (cost: number) => cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`
  const tokenTrendData = useMemo(() => {
    const source = tokenTrend && tokenTrend.length > 0
      ? tokenTrend
      : [{ ...point, total_tokens: stats.total_tokens }]
    const sorted = [...source].sort((left, right) => left.date.localeCompare(right.date))
    const selectedIndex = sorted.findIndex((item) => item.date === point.date)
    if (selectedIndex < 0) {
      return [{ date: point.date, total_tokens: stats.total_tokens }]
    }
    const start = Math.max(0, selectedIndex - 6)
    const end = Math.min(sorted.length, selectedIndex + 8)
    return sorted.slice(start, end)
  }, [point, stats.total_tokens, tokenTrend])
  const maxTrendTokens = Math.max(...tokenTrendData.map((item) => item.total_tokens), 1)
  const tokenTrendPoints = useMemo(() => {
    const lastIndex = Math.max(tokenTrendData.length - 1, 1)
    return tokenTrendData.map((item, index) => {
      const x = (index / lastIndex) * 100
      const y = 44 - (item.total_tokens / maxTrendTokens) * 38
      return { item, x, y }
    })
  }, [maxTrendTokens, tokenTrendData])
  const tokenTrendLine = tokenTrendPoints
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ')
  const tokenTrendArea = tokenTrendPoints.length > 0
    ? `0,48 ${tokenTrendLine} 100,48`
    : ''
  const hoveredTrendPoint = tokenTrendPoints.find((trendPoint) => trendPoint.item.date === hoveredTrendDate)
  const hiddenProjectCount = Math.max(0, stats.project_breakdown.length - topProjects.length)
  const cardMax = Math.max(
    stats.session_count,
    stats.total_messages,
    stats.total_tokens,
    stats.project_count,
    1,
  )

  const sessionsScale = intensity(stats.session_count, cardMax)
  const messagesScale = intensity(stats.total_messages, cardMax)
  const tokensScale = intensity(stats.total_tokens, cardMax)
  const projectsScale = intensity(stats.project_count, cardMax)

  const jumpToPanel = (panel: FocusPanel) => {
    if (!panel) return
    setFocusPanel(panel)
    window.setTimeout(() => setFocusPanel(null), 1200)

    if (panel === 'projects') {
      projectsRef.current?.scrollIntoView({ block: 'nearest' })
      return
    }

    sessionsRef.current?.scrollIntoView({ block: 'nearest' })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-3 md:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-xl ui-enter-fade"
        onClick={onClose}
      />

      <div className="relative w-full sm:w-[92vw] max-w-[1440px] h-[92vh] sm:h-[88vh] overflow-hidden rounded-2xl border border-border/35 bg-background/95 shadow-[0_24px_64px_rgba(0,0,0,0.32)] ui-enter-fade ui-enter-zoom flex flex-col">
        <div className="relative border-b border-border/20 px-4 py-2.5 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[1.28rem] leading-[1.08] font-semibold tracking-tight text-foreground truncate sm:text-[1.5rem]">
                {formattedDate}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{daySummary}</span>
                <Badge
                  tone={activityConfig.color}
                  label={t(activityConfig.label)}
                  value={`${point.level}/5`}
                />
                <span className="inline-flex items-center rounded-full border border-border/25 bg-muted/25 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {hasDetailedStats
                    ? t('dashboard.heatmapModal.detailedMode', 'Detailed mode')
                    : t('dashboard.heatmapModal.lightweightMode', 'Lightweight mode')}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="shrink-0 rounded-lg border border-border/20 bg-muted/15 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/30 motion-surface motion-color focus-ring"
              aria-label={t('common.close')}
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 p-2.5 sm:p-4 grid grid-rows-[auto_1fr] gap-2.5 bg-gradient-to-b from-muted/8 to-transparent">
          {loading ? (
            <div className="h-full rounded-xl border border-border/20 bg-muted/15 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <div className="text-xs text-muted-foreground">{t('dashboard.loading', 'Loading dashboard...')}</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <StatCard
                  icon={Terminal}
                  label={t('dashboard.stats.sessions')}
                  value={formatCompactNumber(stats.session_count)}
                  color="#569cd6"
                  emphasis={sessionsScale}
                  onClick={hasSessions ? () => jumpToPanel('sessions') : undefined}
                  hint={hasSessions ? t('dashboard.heatmapModal.viewSessions', 'View sessions') : undefined}
                />
                <StatCard
                  icon={MessageSquare}
                  label={t('dashboard.stats.messages')}
                  value={formatCompactNumber(stats.total_messages)}
                  color="#7ee787"
                  emphasis={messagesScale}
                />
                <StatCard
                  icon={Zap}
                  label={t('dashboard.stats.tokens')}
                  value={formatCompactNumber(stats.total_tokens)}
                  color="#c792ea"
                  emphasis={tokensScale}
                />
                <StatCard
                  icon={Folder}
                  label={t('dashboard.stats.projects')}
                  value={formatCompactNumber(stats.project_count)}
                  color="#ffa657"
                  emphasis={projectsScale}
                  onClick={hasProjects ? () => jumpToPanel('projects') : undefined}
                  hint={hasProjects ? t('dashboard.heatmapModal.viewProjects', 'View projects') : undefined}
                />
              </div>

              <div className="min-h-0 grid grid-cols-1 xl:grid-cols-12 xl:grid-rows-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-2.5">
                <section className="xl:col-span-4 rounded-xl border bg-card/55 border-border/20 p-3.5 min-h-0 flex flex-col shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Zap className="w-4 h-4 text-muted-foreground" />
                      {t('dashboard.heatmapModal.tokenModelView', 'Tokens & models')}
                    </h3>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatCompactNumber(stats.total_tokens)}</span>
                  </div>

                  <div className="flex-1 min-h-0 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border/15 bg-background/20 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('dashboard.stats.tokens')}</div>
                      <div className="mt-1 text-[1.65rem] leading-none font-semibold tracking-tight text-foreground tabular-nums">
                        {formatCompactNumber(stats.total_tokens)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/15 bg-background/20 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('dashboard.heatmapModal.modelStats', 'Model stats')}</div>
                      <div className="mt-1 text-[1.65rem] leading-none font-semibold tracking-tight text-foreground tabular-nums">
                        {formatCompactNumber(modelRows.length)}
                      </div>
                    </div>
                    <MiniMetric
                      label={t('dashboard.heatmapModal.inputTokens', 'Input')}
                      value={formatCompactNumber(tokenDetails.total_input)}
                      accent="#38bdf8"
                    />
                    <MiniMetric
                      label={t('dashboard.heatmapModal.outputTokens', 'Output')}
                      value={formatCompactNumber(tokenDetails.total_output)}
                      accent="#a78bfa"
                    />
                    <MiniMetric
                      label={t('dashboard.heatmapModal.cacheTokens', 'Cache')}
                      value={formatCompactNumber(cacheTokens)}
                      accent="#34d399"
                    />
                    <MiniMetric
                      label={t('dashboard.heatmapModal.totalCost', 'Cost')}
                      value={formatCost(tokenDetails.total_cost)}
                      accent="#f59e0b"
                    />
                  </div>

                  {modelRows.length > 0 && (
                    <div className="mt-2 space-y-1 overflow-y-auto pr-1 max-h-[72px]">
                      {modelRows.slice(0, 3).map(([model, count]) => {
                        const percentage = modelTotal > 0 ? (count / modelTotal) * 100 : 0
                        const color = metricColor(percentage / 100)
                        return (
                          <div key={model} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="w-20 truncate text-foreground">{model}</span>
                            <div className="h-1 flex-1 rounded-full bg-muted/55 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: color }} />
                            </div>
                            <span className="w-5 text-right tabular-nums">{count}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section className="xl:col-span-4 rounded-xl border bg-card/55 border-border/20 p-3.5 min-h-0 flex flex-col shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      {t('dashboard.heatmapModal.tokenTrend', 'Token trend')}
                    </h3>
                    <span className="text-xs text-muted-foreground tabular-nums">{tokenTrendData.length}d</span>
                  </div>

                  <div className="relative flex-1 min-h-0 rounded-lg border border-border/15 bg-background/20 px-2 py-2">
                    <svg className="h-full min-h-[92px] w-full overflow-visible" viewBox="0 0 100 54" preserveAspectRatio="none" role="img" aria-label={t('dashboard.heatmapModal.tokenTrend', 'Token trend')}>
                      <defs>
                        <linearGradient id="token-trend-stroke" x1="0" x2="1" y1="0" y2="0">
                          <stop offset="0%" stopColor="#38bdf8" />
                          <stop offset="55%" stopColor="#8b5cf6" />
                          <stop offset="100%" stopColor="#34d399" />
                        </linearGradient>
                        <linearGradient id="token-trend-fill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="rgb(56 189 248 / 0.22)" />
                          <stop offset="100%" stopColor="rgb(139 92 246 / 0.02)" />
                        </linearGradient>
                      </defs>
                      {tokenTrendArea && (
                        <polygon points={tokenTrendArea} fill="url(#token-trend-fill)" />
                      )}
                      <polyline
                        points={tokenTrendLine}
                        fill="none"
                        stroke="url(#token-trend-stroke)"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      {tokenTrendPoints.map(({ item, x, y }) => {
                        const isSelectedDay = item.date === point.date
                        const isHovered = item.date === hoveredTrendDate
                        const parsed = parseISO(item.date)
                        const dayLabel = Number.isNaN(parsed.getTime()) ? item.date.slice(5) : format(parsed, 'MM/dd')
                        return (
                          <circle
                            key={item.date}
                            cx={x}
                            cy={y}
                            r={isHovered ? 3.4 : isSelectedDay ? 2.8 : 2}
                            className="cursor-pointer motion-surface"
                            fill={isSelectedDay || isHovered ? '#38bdf8' : '#8b5cf6'}
                            stroke="rgb(var(--color-background) / 0.96)"
                            strokeWidth="1.2"
                            vectorEffect="non-scaling-stroke"
                            onMouseEnter={() => setHoveredTrendDate(item.date)}
                            onMouseLeave={() => setHoveredTrendDate(null)}
                          >
                            <title>{`${dayLabel} · ${formatCompactNumber(item.total_tokens)} ${t('dashboard.heatmapModal.tokenUnit', 'tokens')}`}</title>
                          </circle>
                        )
                      })}
                    </svg>
                    {hoveredTrendPoint && (
                      <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-border/30 bg-background/90 px-2 py-1 text-[10px] shadow-lg backdrop-blur tabular-nums">
                        <div className="font-medium text-foreground">{format(parseISO(hoveredTrendPoint.item.date), 'MM/dd')}</div>
                        <div className="text-muted-foreground">{formatCompactNumber(hoveredTrendPoint.item.total_tokens)} {t('dashboard.heatmapModal.tokenUnit', 'tokens')}</div>
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-2 bottom-1 flex justify-between text-[9px] text-muted-foreground tabular-nums">
                      {tokenTrendData.length > 0 && <span>{format(parseISO(tokenTrendData[0].date), 'MM/dd')}</span>}
                      {tokenTrendData.length > 1 && <span>{format(parseISO(tokenTrendData[tokenTrendData.length - 1].date), 'MM/dd')}</span>}
                    </div>
                  </div>
                </section>

                <section className="xl:col-span-4 rounded-xl border bg-card/55 border-border/20 p-3 min-h-0 flex flex-col shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      {t('dashboard.stats.hourlyDistribution')}
                    </h3>
                    {selectedHour !== null && (
                      <button
                        type="button"
                        onClick={() => setSelectedHour(null)}
                        className="inline-flex items-center rounded-full border border-border/30 bg-background/20 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:border-border/50 motion-color focus-ring"
                      >
                        {t('common.clear', 'Clear')} {selectedHour.toString().padStart(2, '0')}:00
                      </button>
                    )}
                  </div>

                  {hasHourlyData ? (
                    <div className="flex-1 min-h-0 flex flex-col">
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <MiniMetric
                          label={t('dashboard.hourly.peakHour', 'Peak Hour')}
                          value={`${peakHour.hour.toString().padStart(2, '0')}:00`}
                          accent={metricColor(intensity(peakHour.count, maxHourly))}
                        />
                        <MiniMetric
                          label={t('dashboard.hourly.activeHours', 'Active Hours')}
                          value={activeHours.toString()}
                          accent={metricColor(activeHours / 24)}
                        />
                        <MiniMetric
                          label={t('dashboard.hourly.peakMessages', 'Peak Messages')}
                          value={formatCompactNumber(peakHour.count)}
                          accent={metricColor(intensity(peakHour.count, maxHourly))}
                        />
                      </div>

                      <div className="grid gap-[3px] items-end flex-1 min-h-[58px] rounded-lg border border-border/15 bg-background/20 px-2 py-2" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                        {hourlyData.map((item) => {
                          const heightPercent = (item.count / maxHourly) * 100
                          const isSelected = selectedHour === item.hour
                          const barColor = metricColor(item.count / maxHourly)
                          return (
                            <button
                              key={item.hour}
                              type="button"
                              className={`h-full rounded-[3px] relative overflow-hidden motion-color focus-ring ${isSelected ? 'ring-1 ring-info/70' : 'hover:bg-background/30'}`}
                              aria-label={`${item.hour.toString().padStart(2, '0')}:00 · ${item.count} ${t('dashboard.heatmapModal.messageUnit', 'messages')}`}
                              style={{ backgroundColor: item.count === 0 ? 'rgba(148, 163, 184, 0.12)' : hexToRgba(barColor, 0.18) }}
                              title={`${item.hour.toString().padStart(2, '0')}:00 · ${item.count}`}
                              onClick={() => setSelectedHour((current) => (current === item.hour ? null : item.hour))}
                            >
                              <div
                                className="absolute bottom-0 left-0 right-0"
                                style={{
                                  height: `${heightPercent}%`,
                                  backgroundColor: isSelected ? '#569cd6' : barColor,
                                }}
                              />
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <EmptyHint
                      text={hasDetailedStats
                        ? t('dashboard.hourly.noActivity', 'No hourly activity for this day')
                        : t('dashboard.hourly.unavailable', 'Hourly distribution unavailable without detailed parsing')}
                    />
                  )}
                </section>

                <section
                  ref={projectsRef}
                  className={`xl:col-span-4 rounded-xl border bg-card/55 border-border/20 p-3.5 min-h-0 flex flex-col shadow-sm ${focusPanel === 'projects' ? 'ring-1 ring-primary/45' : ''}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Folder className="w-4 h-4 text-muted-foreground" />
                      {t('dashboard.heatmapModal.projectShare', 'Projects')}
                    </h3>
                    <span className="inline-flex items-center rounded-full border border-border/20 bg-background/25 px-2 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                      {hasProjects ? `${stats.project_breakdown.length}` : '--'}
                    </span>
                  </div>

                  {hasProjects ? (
                    <div className="space-y-1.5 overflow-y-auto pr-1">
                      {topProjects.map((project) => {
                        const percentage = stats.total_messages > 0
                          ? (project.message_count / stats.total_messages) * 100
                          : 0
                        const target = project.project_path || project.project_name
                        const canFilter = Boolean(onFilterProject && target)
                        const projectColor = metricColor(percentage / 100)

                        return (
                          <button
                            key={`${project.project_path}-${project.project_name}`}
                            type="button"
                            className={`w-full text-left rounded-lg border px-2.5 py-2 ${canFilter ? 'border-border/15 bg-background/18 hover:bg-background/28 hover:border-border/30 motion-surface motion-color focus-ring' : 'border-transparent bg-transparent'}`}
                            onClick={() => canFilter && onFilterProject?.(target)}
                            disabled={!canFilter}
                          >
                            <div className="flex items-center justify-between gap-2 text-sm leading-tight">
                              <span className="font-medium text-foreground truncate">{project.project_name}</span>
                              <span className="tabular-nums text-xs font-medium" style={{ color: projectColor }}>{percentage.toFixed(0)}%</span>
                            </div>
                            <div className="mt-1 h-1 bg-muted/55 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full motion-width"
                                style={{ width: `${percentage}%`, backgroundColor: projectColor }}
                              />
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                              <span>{formatCompactNumber(project.message_count)} {t('dashboard.heatmapModal.messageUnit', 'messages')}</span>
                              <span>{formatCompactNumber(project.token_count)} {t('dashboard.heatmapModal.tokenUnit', 'tokens')}</span>
                            </div>
                          </button>
                        )
                      })}

                      {hiddenProjectCount > 0 && (
                        <div className="text-xs text-muted-foreground px-2 pt-1">
                          +{hiddenProjectCount} {t('dashboard.heatmapModal.moreProjects', 'more projects')}
                        </div>
                      )}
                    </div>
                  ) : (
                    <EmptyHint text={t('dashboard.heatmapModal.projectsUnavailable', 'No project breakdown for this day')} />
                  )}
                </section>

                <section
                  ref={sessionsRef}
                  className={`xl:col-span-8 rounded-xl border bg-card/55 border-border/20 p-3.5 min-h-0 flex flex-col shadow-sm ${focusPanel === 'sessions' ? 'ring-1 ring-primary/45' : ''}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-muted-foreground" />
                      {selectedHour !== null
                        ? `${t('dashboard.heatmapModal.sessionsCompact', 'Sessions')} · ${selectedHour.toString().padStart(2, '0')}:00`
                        : t('dashboard.heatmapModal.sessionsCompact', 'Sessions')}
                    </h3>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatCompactNumber(filteredSessions.length)}
                    </span>
                  </div>

                  {hasSessions ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                      {filteredSessions.length === 0 && (
                        <EmptyHint text={t('dashboard.hourly.noSessionsForHour', 'No sessions in this hour')} />
                      )}

                      {filteredSessions.slice(0, 8).map((session) => {
                        const sessionScale = intensity(session.message_count, maxSessionMessages)
                        const sessionColor = metricColor(sessionScale)
                        return (
                          <button
                            key={session.path}
                            type="button"
                            onClick={() => onOpenSession?.(session.path)}
                            className={`group relative w-full rounded-lg border bg-background/18 px-2.5 py-2 text-left ${onOpenSession ? 'border-border/15 hover:border-border/30 hover:bg-background/28 motion-surface motion-color focus-ring' : 'border-border/12'}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-medium text-foreground truncate">
                                  {session.name || getPathBasename(session.cwd)}
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2 tabular-nums">
                                  <span>{format(parseISO(session.timestamp), 'HH:mm')}</span>
                                  <span className="truncate max-w-[150px]">{session.model}</span>
                                  <span className="inline-flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: withAlpha(sessionColor, 0.85) }} />
                                    {formatCompactNumber(session.message_count)} {t('dashboard.heatmapModal.messageUnit', 'messages')}
                                  </span>
                                  <span>{formatCompactNumber(session.token_count)} {t('dashboard.heatmapModal.tokenUnit', 'tokens')}</span>
                                </div>
                              </div>
                              {onOpenSession && <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground motion-color" />}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <EmptyHint text={t('dashboard.heatmapModal.sessionsUnavailable', 'Session list unavailable in lightweight mode')} />
                  )}
                </section>
              </div>

            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  color: string
  emphasis: number
  onClick?: () => void
  hint?: string
}

function StatCard({ icon: Icon, label, value, color, emphasis, onClick, hint }: StatCardProps) {
  const interactive = Boolean(onClick)
  const tone = metricColor(emphasis)
  return (
    <button
      type="button"
      className={`group rounded-xl border border-border/15 px-3 py-2 text-left w-full ${interactive ? 'bg-card/55 hover:bg-card/80 motion-surface motion-color focus-ring' : 'bg-card/45 cursor-default'}`}
      onClick={onClick}
      disabled={!interactive}
    >
      <div className="flex items-center gap-2">
        <div className="p-1 rounded-md" style={{ backgroundColor: hexToRgba(color, 0.12) }}>
          <span style={{ color }}>
            <Icon className="w-3.5 h-3.5" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground truncate">{label}</span>
            {interactive && (
              <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground group-hover:text-foreground motion-color" />
            )}
          </div>
          <div className="mt-0.5 flex items-end justify-between gap-2">
            <span className="text-[1.22rem] font-semibold tracking-tight text-foreground tabular-nums leading-none">{value}</span>
            {hint && <span className="text-[10px] text-muted-foreground truncate">{hint}</span>}
          </div>
        </div>
      </div>
      <div className="mt-1.5 h-[2px] rounded-full bg-muted/55 overflow-hidden">
        <div className="h-full rounded-full motion-width" style={{ width: `${Math.max(8, emphasis * 100)}%`, backgroundColor: withAlpha(tone, 0.72) }} />
      </div>
    </button>
  )
}

function Badge({ tone, label, value }: { tone: string; label: string; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={{
        color: withAlpha(tone, 0.92),
        borderColor: withAlpha(tone, 0.24),
        backgroundColor: withAlpha(tone, 0.08),
      }}
    >
      <span className="w-1 h-1 rounded-full" style={{ backgroundColor: withAlpha(tone, 0.9) }} />
      <span>{label}</span>
      <span className="tabular-nums text-muted-foreground">{value}</span>
    </span>
  )
}

function MiniMetric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-border/15 bg-background/18 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <span className="w-1 h-1 rounded-full" style={{ backgroundColor: withAlpha(accent, 0.85) }} />
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</div>
      </div>
      <div className="text-[0.98rem] font-semibold text-foreground tabular-nums mt-1">{value}</div>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="h-full rounded-lg border border-border/15 bg-background/18 px-2.5 py-2 text-xs text-muted-foreground flex items-center">
      {text}
    </div>
  )
}
