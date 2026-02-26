import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
} from 'lucide-react'
import type { HeatmapPoint, DayStats } from '../../types'

interface HeatmapDayModalProps {
  point: HeatmapPoint
  onClose: () => void
  dayStats?: DayStats
  loading?: boolean
  onFilterProject?: (projectPathOrName: string) => void
  onOpenSession?: (sessionPath: string) => void
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
  const saturation = 68
  const lightness = 56
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
}: HeatmapDayModalProps) {
  const { t } = useTranslation()

  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const [focusPanel, setFocusPanel] = useState<FocusPanel>(null)

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
  }, [point.date])

  const formattedDate = format(parseISO(point.date), 'EEEE, MMMM dd, yyyy')
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
    () => stats.project_breakdown.slice(0, 12),
    [stats.project_breakdown],
  )

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
      projectsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      return
    }

    sessionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[1040px] h-[min(86vh,780px)] overflow-hidden glass-card rounded-2xl border border-border/20 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/10">
          <div className="min-w-0 flex items-baseline gap-2.5">
            <h2 className="text-[2rem] leading-none font-semibold tracking-tight text-foreground truncate">{formattedDate}</h2>
            <span className="inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap" style={{ color: activityConfig.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activityConfig.color }} />
              {t(activityConfig.label)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="h-[calc(100%-98px)] p-4 grid grid-rows-[auto_1fr] gap-3">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                <StatCard
                  icon={Terminal}
                  label={t('dashboard.stats.sessions')}
                  value={formatCompactNumber(stats.session_count)}
                  color="#569cd6"
                  emphasis={sessionsScale}
                  onClick={hasSessions ? () => jumpToPanel('sessions') : undefined}
                  hint={hasSessions ? t('dashboard.heatmapModal.clickToJump', 'click to jump') : undefined}
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
                  hint={hasProjects ? t('dashboard.heatmapModal.clickToJump', 'click to jump') : undefined}
                />
              </div>

              <div className="min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-3">
                <section
                  ref={projectsRef}
                  className={`xl:col-span-5 rounded-xl border bg-muted/25 border-border/15 p-4 min-h-0 flex flex-col ${focusPanel === 'projects' ? 'ring-1 ring-primary/60' : ''}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Folder className="w-4 h-4 text-muted-foreground" />
                      {t('dashboard.stats.projects')}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {hasProjects ? `${stats.project_breakdown.length}` : '--'}
                    </span>
                  </div>

                  {hasProjects ? (
                    <div className="space-y-2 overflow-y-auto pr-1">
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
                            className={`w-full text-left rounded-lg px-2 py-1.5 border border-transparent ${canFilter ? 'hover:bg-muted/55 hover:border-border/20 transition-colors' : ''}`}
                            onClick={() => canFilter && onFilterProject?.(target)}
                            disabled={!canFilter}
                          >
                            <div className="flex items-center justify-between text-sm leading-tight">
                              <span className="font-medium text-foreground truncate max-w-[72%]">{project.project_name}</span>
                              <span className="tabular-nums text-xs" style={{ color: projectColor }}>{percentage.toFixed(0)}%</span>
                            </div>
                            <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${percentage}%`,
                                  backgroundColor: projectColor,
                                }}
                              />
                            </div>
                            <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2.5 tabular-nums">
                              <span>{formatCompactNumber(project.session_count)} s</span>
                              <span>{formatCompactNumber(project.message_count)} m</span>
                              <span>{formatCompactNumber(project.token_count)} t</span>
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

                <div className="xl:col-span-7 min-h-0 grid grid-rows-[auto_1fr] gap-4">
                  <section className="rounded-xl border bg-muted/25 border-border/15 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        {t('dashboard.stats.hourlyDistribution')}
                      </h3>
                      {selectedHour !== null && (
                        <button
                          type="button"
                          onClick={() => setSelectedHour(null)}
                          className="text-xs text-primary hover:text-primary/80"
                        >
                          {t('common.clear', 'Clear')} {selectedHour.toString().padStart(2, '0')}:00
                        </button>
                      )}
                    </div>

                    {hasHourlyData ? (
                      <>
                        <div className="grid grid-cols-3 gap-2 mb-3">
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

                        <div className="text-[11px] text-muted-foreground mb-2">
                          {t('dashboard.hourly.clickToFilter', 'Click bars to filter sessions by hour')}
                        </div>

                        <div className="grid gap-1 items-end h-16" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
                          {hourlyData.map((item) => {
                            const heightPercent = (item.count / maxHourly) * 100
                            const isSelected = selectedHour === item.hour
                            const barColor = metricColor(item.count / maxHourly)
                            return (
                              <button
                                key={item.hour}
                                type="button"
                                className={`h-full rounded-[2px] relative overflow-hidden ${isSelected ? 'ring-1 ring-primary' : ''}`}
                                style={{ backgroundColor: item.count === 0 ? 'rgba(148, 163, 184, 0.12)' : hexToRgba(barColor, 0.18) }}
                                title={`${item.hour.toString().padStart(2, '0')}:00 · ${item.count}`}
                                onClick={() => setSelectedHour((current) => (current === item.hour ? null : item.hour))}
                              >
                                <div
                                  className="absolute bottom-0 left-0 right-0"
                                  style={{
                                    height: `${heightPercent}%`,
                                    backgroundColor: isSelected ? '#6366f1' : barColor,
                                  }}
                                />
                              </button>
                            )
                          })}
                        </div>

                        <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground tabular-nums">
                          <span>00</span>
                          <span>06</span>
                          <span>12</span>
                          <span>18</span>
                          <span>23</span>
                        </div>
                      </>
                    ) : (
                      <EmptyHint
                        text={hasDetailedStats
                          ? t('dashboard.hourly.noActivity', 'No hourly activity for this day')
                          : t('dashboard.hourly.unavailable', 'Hourly distribution unavailable without detailed parsing')}
                      />
                    )}
                  </section>

                  <section
                    ref={sessionsRef}
                    className={`rounded-xl border bg-muted/25 border-border/15 p-4 min-h-0 flex flex-col ${focusPanel === 'sessions' ? 'ring-1 ring-primary/60' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-muted-foreground" />
                        {selectedHour !== null
                          ? `${t('dashboard.stats.sessions')} · ${selectedHour.toString().padStart(2, '0')}:00`
                          : t('dashboard.stats.sessions')}
                      </h3>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatCompactNumber(filteredSessions.length)}
                      </span>
                    </div>

                    {hasSessions ? (
                      <div className="space-y-1 overflow-y-auto pr-1">
                        {filteredSessions.length === 0 && (
                          <EmptyHint text={t('dashboard.hourly.noSessionsForHour', 'No sessions in this hour')} />
                        )}

                        {filteredSessions.map((session) => {
                          const sessionScale = intensity(session.message_count, maxSessionMessages)
                          const sessionColor = metricColor(sessionScale)
                          return (
                            <button
                              key={session.path}
                              type="button"
                              onClick={() => onOpenSession?.(session.path)}
                              className={`w-full rounded-lg border border-border/10 bg-muted/35 px-2.5 py-1.5 text-left ${onOpenSession ? 'hover:border-border/30 transition-colors' : ''}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="text-[13px] font-medium text-foreground truncate">
                                    {session.name || session.cwd.split('/').pop()}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2.5 tabular-nums">
                                    <span>{format(parseISO(session.timestamp), 'HH:mm')}</span>
                                    <span className="truncate max-w-[140px]">{session.model}</span>
                                    <span className="inline-flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: withAlpha(sessionColor, 0.85) }} />
                                      {formatCompactNumber(session.message_count)}m
                                    </span>
                                    <span>{formatCompactNumber(session.token_count)}t</span>
                                  </div>
                                </div>
                                {onOpenSession && <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />}
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
              </div>
            </>
          )}
        </div>
      </div>
    </div>
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
      className={`p-3 rounded-xl border border-border/10 bg-muted/40 text-left w-full ${interactive ? 'hover:border-border/25 transition-colors' : 'cursor-default'}`}
      onClick={onClick}
      disabled={!interactive}
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1.5 rounded-md" style={{ backgroundColor: hexToRgba(color, 0.14) }}>
          <span style={{ color }}>
            <Icon className="w-4 h-4" />
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-3xl font-semibold tracking-tight text-foreground tabular-nums leading-none">{value}</div>
      <div className="mt-2 h-0.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(8, emphasis * 100)}%`, backgroundColor: withAlpha(tone, 0.8) }} />
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1.5">{hint}</div>}
    </button>
  )
}

function MiniMetric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg border border-border/10 bg-muted/40 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: withAlpha(accent, 0.85) }} />
        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      </div>
      <div className="text-base font-semibold text-foreground tabular-nums mt-1">{value}</div>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="h-full rounded-lg border border-border/10 bg-muted/35 px-3 py-2 text-sm text-muted-foreground flex items-center">
      {text}
    </div>
  )
}
