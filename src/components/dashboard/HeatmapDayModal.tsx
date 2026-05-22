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
  TrendingUp,
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

const TOKEN_TREND_CHART = {
  left: 4,
  right: 96,
  top: 8,
  bottom: 42,
}

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
  const hourlyMetricItems = [
    {
      label: t('dashboard.hourly.peakHour', 'Peak Hour'),
      value: `${peakHour.hour.toString().padStart(2, '0')}:00`,
      accent: metricColor(intensity(peakHour.count, maxHourly)),
    },
    {
      label: t('dashboard.hourly.activeHours', 'Active Hours'),
      value: activeHours.toString(),
      accent: metricColor(activeHours / 24),
    },
    {
      label: t('dashboard.hourly.peakMessages', 'Peak Messages'),
      value: formatCompactNumber(peakHour.count),
      accent: metricColor(intensity(peakHour.count, maxHourly)),
    },
  ]

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
  const tokenBreakdownItems = [
    { label: t('dashboard.heatmapModal.inputTokens', 'Input'), value: tokenDetails.total_input, color: 'rgb(59 130 246 / 0.92)' },
    { label: t('dashboard.heatmapModal.outputTokens', 'Output'), value: tokenDetails.total_output, color: 'rgb(20 184 166 / 0.92)' },
    { label: t('dashboard.heatmapModal.cacheTokens', 'Cache'), value: cacheTokens, color: 'rgb(139 92 246 / 0.88)' },
  ]
  const tokenBreakdownTotal = Math.max(tokenBreakdownItems.reduce((sum, item) => sum + item.value, 0), 1)
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
  const averageTrendTokens = Math.round(
    tokenTrendData.reduce((sum, item) => sum + item.total_tokens, 0) / Math.max(tokenTrendData.length, 1),
  )
  const tokenTrendPoints = useMemo(() => {
    const lastIndex = Math.max(tokenTrendData.length - 1, 1)
    const chartWidth = TOKEN_TREND_CHART.right - TOKEN_TREND_CHART.left
    const chartHeight = TOKEN_TREND_CHART.bottom - TOKEN_TREND_CHART.top

    return tokenTrendData.map((item, index) => {
      const x = TOKEN_TREND_CHART.left + (index / lastIndex) * chartWidth
      const y = TOKEN_TREND_CHART.bottom - (item.total_tokens / maxTrendTokens) * chartHeight
      const parsed = parseISO(item.date)
      const label = Number.isNaN(parsed.getTime()) ? item.date.slice(5) : format(parsed, 'MM/dd')
      return { item, x, y, label }
    })
  }, [maxTrendTokens, tokenTrendData])
  const tokenTrendLine = tokenTrendPoints
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ')
  const tokenTrendArea = tokenTrendPoints.length > 0
    ? `${TOKEN_TREND_CHART.left},${TOKEN_TREND_CHART.bottom + 4} ${tokenTrendLine} ${TOKEN_TREND_CHART.right},${TOKEN_TREND_CHART.bottom + 4}`
    : ''
  const hoveredTrendPoint = tokenTrendPoints.find((trendPoint) => trendPoint.item.date === hoveredTrendDate)
  const selectedTrendPoint = tokenTrendPoints.find((trendPoint) => trendPoint.item.date === point.date)
  const averageTrendY = TOKEN_TREND_CHART.bottom - (averageTrendTokens / maxTrendTokens) * (TOKEN_TREND_CHART.bottom - TOKEN_TREND_CHART.top)
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

      <div className="relative w-full sm:w-[92vw] max-w-[1440px] h-[92vh] sm:h-[88vh] overflow-hidden rounded-xl border border-border/35 bg-background/95 shadow-[0_24px_64px_rgba(0,0,0,0.32)] ui-enter-fade ui-enter-zoom flex flex-col">
        <div className="relative border-b border-border/20 px-4 py-3 sm:px-5 bg-card/25">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[1.28rem] leading-[1.08] font-semibold tracking-tight text-foreground truncate sm:text-[1.5rem]">
                {formattedDate}
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 max-w-full truncate">{daySummary}</span>
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

        <div className="relative flex-1 min-h-0 p-2.5 sm:p-4 grid grid-rows-[auto_1fr] gap-3 bg-gradient-to-b from-muted/8 to-transparent">
          {loading ? (
            <div className="h-full rounded-xl border border-border/20 bg-muted/15 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <div className="text-xs text-muted-foreground">{t('dashboard.loading', 'Loading dashboard...')}</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
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

              <div className="min-h-0 grid grid-cols-1 xl:grid-cols-12 xl:grid-rows-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-3">
                <section className="xl:col-span-4 rounded-xl border bg-card/55 border-border/20 p-3.5 min-h-0 overflow-hidden flex flex-col shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Zap className="w-4 h-4 text-muted-foreground" />
                      {t('dashboard.heatmapModal.modelStats', 'Model stats')}
                    </h3>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatCompactNumber(modelRows.length)}</span>
                  </div>

                  {modelRows.length > 0 ? (
                    <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
                      {modelRows.map(([model, count], index) => {
                        const percentage = modelTotal > 0 ? (count / modelTotal) * 100 : 0
                        const color = metricColor(percentage / 100)
                        return (
                          <div key={model} className="rounded-lg border border-border/15 bg-background/18 px-2.5 py-2">
                            <div className="flex items-center justify-between gap-2 text-xs leading-tight">
                              <div className="min-w-0 flex items-center gap-2">
                                <span className="w-4 shrink-0 text-[10px] tabular-nums text-muted-foreground">{index + 1}</span>
                                <span className="truncate font-medium text-foreground">{model}</span>
                              </div>
                              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{count}</span>
                            </div>
                            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted/45">
                              <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: color }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <EmptyHint text={t('dashboard.heatmapModal.modelsUnavailable', 'No model stats for this day')} />
                  )}
                </section>

                <section className="xl:col-span-4 rounded-xl border bg-card/55 border-border/20 p-3.5 min-h-0 flex flex-col shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-muted-foreground" />
                        {t('dashboard.heatmapModal.tokenTrend', 'Token trend')}
                      </h3>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
                        <span>{tokenTrendData.length}d</span>
                        <span className="h-1 w-1 rounded-full bg-muted-foreground/30" />
                        <span>{t('dashboard.heatmapModal.avgTokens', 'Avg')} {formatCompactNumber(averageTrendTokens)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <div className="text-[1.05rem] font-semibold leading-none text-foreground">
                        {formatCompactNumber(selectedTrendPoint?.item.total_tokens ?? stats.total_tokens)}
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {t('dashboard.heatmapModal.selectedDay', 'Selected')}
                      </div>
                    </div>
                  </div>

                  <div className="relative flex-1 min-h-0 rounded-lg border border-border/15 bg-background/18 px-3 py-2.5 overflow-hidden flex flex-col gap-2.5">
                    <div className="h-1.5 flex overflow-hidden rounded-full bg-muted/35">
                      {tokenBreakdownItems.map((item) => (
                        <div
                          key={item.label}
                          className="h-full"
                          style={{ width: `${(item.value / tokenBreakdownTotal) * 100}%`, backgroundColor: item.color }}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-[10px] tabular-nums">
                      {tokenBreakdownItems.map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                            <span className="h-1 w-1 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="truncate">{item.label}</span>
                          </div>
                          <span className="font-semibold text-foreground">{formatCompactNumber(item.value)}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <span className="h-1 w-1 rounded-full bg-warning/80" />
                          <span className="truncate">{t('dashboard.heatmapModal.totalCost', 'Cost')}</span>
                        </div>
                        <span className="font-semibold text-foreground">{formatCost(tokenDetails.total_cost)}</span>
                      </div>
                      <div className="col-span-2 flex items-center justify-between gap-3 border-t border-border/10 pt-1 text-muted-foreground">
                        <span>{t('dashboard.heatmapModal.cacheRead', '缓存读')} {formatCompactNumber(tokenDetails.total_cache_read)}</span>
                        <span>{t('dashboard.heatmapModal.cacheWrite', '缓存写')} {formatCompactNumber(tokenDetails.total_cache_write)}</span>
                        <span>{t('dashboard.heatmapModal.avgTokens', 'Avg')} {formatCompactNumber(averageTrendTokens)}</span>
                      </div>
                    </div>

                    <div className="relative flex-1 min-h-[82px] border-t border-border/10 pt-1">
                      <svg className="h-full w-full overflow-visible" viewBox="0 0 100 54" preserveAspectRatio="none" role="img" aria-label={t('dashboard.heatmapModal.tokenTrend', 'Token trend')}>
                      <defs>
                        <linearGradient id="token-trend-fill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="rgb(20 184 166 / 0.16)" />
                          <stop offset="100%" stopColor="rgb(20 184 166 / 0.01)" />
                        </linearGradient>
                      </defs>
                      {[TOKEN_TREND_CHART.top, averageTrendY, TOKEN_TREND_CHART.bottom].map((y, index) => (
                        <line
                          key={`${index}-${y}`}
                          x1={TOKEN_TREND_CHART.left}
                          x2={TOKEN_TREND_CHART.right}
                          y1={y}
                          y2={y}
                          stroke={index === 1 ? 'rgb(20 184 166 / 0.24)' : 'rgb(var(--color-muted-foreground) / 0.11)'}
                          strokeDasharray={index === 1 ? '3 3' : undefined}
                          strokeWidth="1"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                      {tokenTrendArea && (
                        <polygon points={tokenTrendArea} fill="url(#token-trend-fill)" />
                      )}
                      <polyline
                        points={tokenTrendLine}
                        fill="none"
                        stroke="rgb(20 184 166 / 0.92)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      {selectedTrendPoint && (
                        <line
                          x1={selectedTrendPoint.x}
                          x2={selectedTrendPoint.x}
                          y1={TOKEN_TREND_CHART.top}
                          y2={TOKEN_TREND_CHART.bottom + 3}
                          stroke="rgb(var(--color-foreground) / 0.22)"
                          strokeDasharray="3 3"
                          strokeWidth="1"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {tokenTrendPoints.map(({ item, x, y, label }) => (
                        <circle
                          key={item.date}
                          cx={x}
                          cy={y}
                          r="4"
                          className="cursor-pointer"
                          fill="transparent"
                          onMouseEnter={() => setHoveredTrendDate(item.date)}
                          onMouseLeave={() => setHoveredTrendDate(null)}
                        >
                          <title>{`${label} · ${formatCompactNumber(item.total_tokens)} ${t('dashboard.heatmapModal.tokenUnit', 'tokens')}`}</title>
                        </circle>
                      ))}
                      </svg>
                    </div>
                    {hoveredTrendPoint && (
                      <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-border/25 bg-background/95 px-2 py-1 text-[10px] shadow-sm backdrop-blur tabular-nums">
                        <div className="font-medium text-foreground">{hoveredTrendPoint.label}</div>
                        <div className="text-muted-foreground">{formatCompactNumber(hoveredTrendPoint.item.total_tokens)} {t('dashboard.heatmapModal.tokenUnit', 'tokens')}</div>
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-3 bottom-1.5 flex justify-between text-[9px] text-muted-foreground tabular-nums">
                      {tokenTrendPoints.length > 0 && <span>{tokenTrendPoints[0].label}</span>}
                      {tokenTrendPoints.length > 1 && <span>{tokenTrendPoints[tokenTrendPoints.length - 1].label}</span>}
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
                        {hourlyMetricItems.map((item) => (
                          <div key={item.label} className="rounded-lg border border-border/15 bg-background/14 px-2.5 py-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full" style={{ backgroundColor: withAlpha(item.accent, 0.85) }} />
                              <div className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{item.label}</div>
                            </div>
                            <div className="text-[0.92rem] font-semibold text-foreground tabular-nums mt-0.5 leading-tight">{item.value}</div>
                          </div>
                        ))}
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
      className={`group rounded-lg border border-border/15 px-3 py-2.5 text-left w-full ${interactive ? 'bg-card/60 hover:bg-card/80 motion-surface motion-color focus-ring' : 'bg-card/45 cursor-default'}`}
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

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="h-full rounded-lg border border-border/15 bg-background/18 px-2.5 py-2 text-xs text-muted-foreground flex items-center">
      {text}
    </div>
  )
}
