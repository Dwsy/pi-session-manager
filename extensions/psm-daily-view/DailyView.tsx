import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  FolderOpen,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import type { PsmPluginHostContext } from '@pi-session-manager/plugin-sdk'
import {
  dateFromKey,
  dateKeyFromDate,
  extractDailyPrompts,
  formatMinute,
  normalizeSession,
  sessionOverlapsDay,
  shiftDateKey,
  type DailyPrompt,
  type DailySessionSummary,
} from './model'

interface DailyViewProps {
  ctx: PsmPluginHostContext
  active: boolean
}

interface LoadProgress {
  phase: 'sessions' | 'messages'
  current: number
  total: number
}

interface LoadResult {
  prompts: DailyPrompt[]
  failedSessions: number
}

interface HourGroup {
  hour: number
  prompts: DailyPrompt[]
  sessionCount: number
}

const PAGE_SIZE = 200
const READ_CONCURRENCY = 6

async function listSessionsForDay(
  ctx: PsmPluginHostContext,
  dateKey: string,
  onProgress: (progress: LoadProgress) => void,
): Promise<DailySessionSummary[]> {
  const sessions: DailySessionSummary[] = []
  const selectedDate = dateFromKey(dateKey)
  const dayStartMs = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate(),
  ).getTime()
  let offset = 0
  let total = 0

  for (;;) {
    const page = await ctx.psm.sessions.list({
      offset,
      limit: PAGE_SIZE,
      sortBy: 'modified_desc',
    })
    const rawSessions = Array.isArray(page.sessions) ? page.sessions : []
    total = page.total
    let oldestModifiedMs = Number.POSITIVE_INFINITY
    let hasUnknownModifiedTime = false

    for (const rawSession of rawSessions) {
      const session = normalizeSession(rawSession)
      if (!session) {
        hasUnknownModifiedTime = true
        continue
      }
      const modifiedMs = session.modifiedAt ? Date.parse(session.modifiedAt) : Number.NaN
      if (Number.isFinite(modifiedMs)) oldestModifiedMs = Math.min(oldestModifiedMs, modifiedMs)
      else hasUnknownModifiedTime = true
      if (sessionOverlapsDay(session, dateKey)) sessions.push(session)
    }

    offset += rawSessions.length
    onProgress({ phase: 'sessions', current: Math.min(offset, total), total })
    const reachedDayBoundary = !hasUnknownModifiedTime && oldestModifiedMs < dayStartMs
    if (rawSessions.length === 0 || !page.has_more || offset >= total || reachedDayBoundary) break
  }

  return sessions
}

async function loadDay(
  ctx: PsmPluginHostContext,
  dateKey: string,
  onProgress: (progress: LoadProgress) => void,
): Promise<LoadResult> {
  const sessions = await listSessionsForDay(ctx, dateKey, onProgress)
  if (sessions.length === 0) return { prompts: [], failedSessions: 0 }

  const prompts: DailyPrompt[] = []
  let failedSessions = 0
  let nextSessionIndex = 0
  let completedSessions = 0

  const workers = Array.from(
    { length: Math.min(READ_CONCURRENCY, sessions.length) },
    async () => {
      for (;;) {
        const sessionIndex = nextSessionIndex
        nextSessionIndex += 1
        if (sessionIndex >= sessions.length) return

        const session = sessions[sessionIndex]
        try {
          const entries = await ctx.psm.sessions.readEntries(session.path)
          if (Array.isArray(entries)) {
            prompts.push(...extractDailyPrompts(entries, session, dateKey))
          }
        } catch {
          failedSessions += 1
        } finally {
          completedSessions += 1
          onProgress({
            phase: 'messages',
            current: completedSessions,
            total: sessions.length,
          })
        }
      }
    },
  )

  await Promise.all(workers)
  prompts.sort((left, right) => (
    left.minuteOfDay - right.minuteOfDay
    || left.sessionName.localeCompare(right.sessionName)
  ))
  return { prompts, failedSessions }
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

export default function DailyView({ ctx, active }: DailyViewProps) {
  const todayKey = dateKeyFromDate(new Date())
  const [dateKey, setDateKey] = useState(todayKey)
  const [prompts, setPrompts] = useState<DailyPrompt[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedSessions, setFailedSessions] = useState(0)
  const [progress, setProgress] = useState<LoadProgress | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [project, setProject] = useState('')
  const [selectedPrompt, setSelectedPrompt] = useState<DailyPrompt | null>(null)
  const [copied, setCopied] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setFailedSessions(0)
    setProgress({ phase: 'sessions', current: 0, total: 0 })

    loadDay(ctx, dateKey, (nextProgress) => {
      if (!cancelled) setProgress(nextProgress)
    })
      .then((result) => {
        if (cancelled) return
        setPrompts(result.prompts)
        setFailedSessions(result.failedSessions)
      })
      .catch((loadError) => {
        if (cancelled) return
        setPrompts([])
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
        setProgress(null)
      })

    return () => {
      cancelled = true
    }
  }, [active, ctx, dateKey, reloadVersion])

  useEffect(() => {
    setSelectedPrompt(null)
    setCopied(false)
    setDetailError(null)
  }, [dateKey])

  useEffect(() => {
    if (!selectedPrompt) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedPrompt(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedPrompt])

  const projects = useMemo(() => {
    const unique = new Set<string>()
    for (const prompt of prompts) {
      if (prompt.cwd) unique.add(prompt.cwd)
    }
    return Array.from(unique).sort((left, right) => left.localeCompare(right))
  }, [prompts])

  const filteredPrompts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    return prompts.filter((prompt) => {
      if (project && prompt.cwd !== project) return false
      if (!normalizedSearch) return true
      return prompt.text.toLocaleLowerCase().includes(normalizedSearch)
        || prompt.sessionName.toLocaleLowerCase().includes(normalizedSearch)
        || prompt.cwd.toLocaleLowerCase().includes(normalizedSearch)
    })
  }, [project, prompts, search])

  const hourGroups = useMemo<HourGroup[]>(() => {
    const grouped = new Map<number, DailyPrompt[]>()
    for (const prompt of filteredPrompts) {
      const hour = Math.floor(prompt.minuteOfDay / 60)
      const group = grouped.get(hour)
      if (group) group.push(prompt)
      else grouped.set(hour, [prompt])
    }

    return Array.from(grouped.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([hour, groupPrompts]) => ({
        hour,
        prompts: groupPrompts,
        sessionCount: new Set(groupPrompts.map((prompt) => prompt.sessionPath)).size,
      }))
  }, [filteredPrompts])

  const summary = useMemo(() => {
    const hourlyCounts = Array.from({ length: 24 }, () => 0)
    const sessionPaths = new Set<string>()
    for (const prompt of filteredPrompts) {
      hourlyCounts[Math.floor(prompt.minuteOfDay / 60)] += 1
      sessionPaths.add(prompt.sessionPath)
    }

    let busiestHour = -1
    for (let hour = 0; hour < hourlyCounts.length; hour += 1) {
      if (busiestHour === -1 || hourlyCounts[hour] > hourlyCounts[busiestHour]) {
        busiestHour = hour
      }
    }

    return {
      first: filteredPrompts.length ? formatMinute(filteredPrompts[0].minuteOfDay) : '—',
      last: filteredPrompts.length ? formatMinute(filteredPrompts[filteredPrompts.length - 1].minuteOfDay) : '—',
      sessionCount: sessionPaths.size,
      activeHours: hourlyCounts.filter((count) => count > 0).length,
      busiestHour: busiestHour >= 0 && hourlyCounts[busiestHour] > 0 ? busiestHour : null,
      busiestCount: busiestHour >= 0 ? hourlyCounts[busiestHour] : 0,
      hourlyCounts,
    }
  }, [filteredPrompts])

  const maxHourlyCount = Math.max(1, ...summary.hourlyCounts)
  const currentHour = dateKey === todayKey ? new Date().getHours() : null

  const dateLabel = useMemo(() => (
    new Intl.DateTimeFormat(ctx.i18n.language || undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(dateFromKey(dateKey))
  ), [ctx.i18n.language, dateKey])

  const promptTimeFormatter = useMemo(() => (
    new Intl.DateTimeFormat(ctx.i18n.language || undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  ), [ctx.i18n.language])

  const progressLabel = progress
    ? progress.phase === 'sessions'
      ? `Scanning sessions ${progress.current}${progress.total ? ` / ${progress.total}` : ''}`
      : `Reading messages ${progress.current} / ${progress.total}`
    : ''

  const showPrompt = useCallback((prompt: DailyPrompt) => {
    setSelectedPrompt(prompt)
    setCopied(false)
    setDetailError(null)
  }, [])

  const copyPrompt = useCallback(async () => {
    if (!selectedPrompt) return
    try {
      await navigator.clipboard.writeText(selectedPrompt.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch (copyError) {
      setDetailError(copyError instanceof Error ? copyError.message : String(copyError))
    }
  }, [selectedPrompt])

  const openSession = useCallback(async () => {
    if (!selectedPrompt) return
    try {
      await ctx.psm.sessions.open(selectedPrompt.sessionPath, { target: 'browser' })
    } catch (openError) {
      setDetailError(openError instanceof Error ? openError.message : String(openError))
    }
  }, [ctx.psm.sessions, selectedPrompt])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="shrink-0 border-b border-border/60 bg-background px-3 py-2.5 lg:px-4">
        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-tight">
                {ctx.i18n.t('plugins.dailyView.title', 'Daily View')}
              </h1>
              <p className="truncate text-[11px] text-muted-foreground">{dateLabel}</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <div className="flex h-8 items-center rounded border border-border bg-card p-0.5">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                onClick={() => setDateKey((value) => shiftDateKey(value, -1))}
                aria-label="Previous day"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <input
                type="date"
                value={dateKey}
                max={todayKey}
                onChange={(event) => event.target.value && setDateKey(event.target.value)}
                className="h-7 min-w-0 border-0 bg-transparent px-1.5 text-xs font-medium tabular-nums text-foreground outline-none"
                aria-label="Selected day"
              />
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-35"
                onClick={() => setDateKey((value) => shiftDateKey(value, 1))}
                disabled={dateKey >= todayKey}
                aria-label="Next day"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {dateKey !== todayKey && (
              <button
                type="button"
                className="h-8 rounded border border-border bg-card px-2.5 text-xs font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                onClick={() => setDateKey(todayKey)}
              >
                Today
              </button>
            )}

            <label className="relative block min-w-[11rem] flex-1 sm:w-52 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search messages"
                className="h-8 w-full rounded border border-border bg-card pl-8 pr-8 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
              />
              {search && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </label>

            <select
              value={project}
              onChange={(event) => setProject(event.target.value)}
              className="h-8 min-w-0 max-w-52 rounded border border-border bg-card px-2.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              aria-label="Project filter"
            >
              <option value="">All projects</option>
              {projects.map((projectPath) => (
                <option key={projectPath} value={projectPath}>{projectPath}</option>
              ))}
            </select>

            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
              onClick={() => setReloadVersion((value) => value + 1)}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-2.5 grid gap-2 border-t border-border/50 pt-2.5 lg:grid-cols-[auto_minmax(18rem,1fr)] lg:items-center lg:gap-5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MessageSquareText className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <strong className="font-semibold tabular-nums text-foreground">{filteredPrompts.length}</strong>
              messages
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <strong className="font-semibold tabular-nums text-foreground">{summary.sessionCount}</strong>
              sessions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-medium tabular-nums text-foreground">{summary.first}–{summary.last}</span>
            </span>
            <span>
              {summary.activeHours} active hours
              {summary.busiestHour !== null ? ` · peak ${hourLabel(summary.busiestHour)} (${summary.busiestCount})` : ''}
            </span>
            {loading && <span className="tabular-nums" role="status">{progressLabel}</span>}
          </div>

          <div className="min-w-0" aria-label="24 hour activity distribution">
            <div className="grid h-7 items-end gap-px" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
              {summary.hourlyCounts.map((count, hour) => (
                <span key={hour} className="flex h-full min-w-0 items-end" title={`${hourLabel(hour)} · ${count} message${count === 1 ? '' : 's'}`}>
                  <span
                    className={`block w-full rounded-sm ${count ? 'bg-primary/65' : 'bg-muted/45'} ${currentHour === hour ? 'ring-1 ring-primary' : ''}`}
                    style={{ height: `${count ? Math.max(18, Math.round(count / maxHourlyCount * 100)) : 8}%` }}
                  />
                </span>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[9px] tabular-nums text-muted-foreground/80" aria-hidden="true">
              <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
            </div>
          </div>
        </div>
      </header>

      <main className="min-h-0 min-w-0 flex-1 p-2.5 lg:p-3">
        <section className="relative h-full min-w-0 overflow-hidden rounded border border-border/70 bg-background">
          {error ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-md rounded border border-destructive/30 bg-destructive/5 p-5 text-center" role="alert">
                <p className="text-sm font-semibold">Unable to load daily messages</p>
                <p className="mt-2 break-words text-xs text-muted-foreground">{error}</p>
                <button
                  type="button"
                  className="mt-4 rounded border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  onClick={() => setReloadVersion((value) => value + 1)}
                >
                  Try again
                </button>
              </div>
            </div>
          ) : loading && prompts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground" role="status">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Loading daily activity</p>
                <p className="mt-1 text-xs">{progressLabel}</p>
              </div>
            </div>
          ) : filteredPrompts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded border border-border bg-card">
                <MessageSquareText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-semibold">No user messages for this view</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                {search || project ? 'Clear the filters to restore the full day.' : 'Choose another day or refresh after new messages are sent.'}
              </p>
            </div>
          ) : (
            <div className="h-full min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain">
              {hourGroups.map((group) => {
                const isCurrentHour = currentHour === group.hour
                return (
                  <section key={group.hour} aria-labelledby={`daily-hour-${group.hour}`}>
                    <div className="sticky top-0 z-10 flex min-w-0 items-center justify-between gap-3 border-b border-border/55 bg-background/95 px-3 py-1.5 backdrop-blur-sm">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <h2
                          id={`daily-hour-${group.hour}`}
                          className={`text-xs font-semibold tabular-nums ${isCurrentHour ? 'text-primary' : 'text-foreground'}`}
                        >
                          {hourLabel(group.hour)}
                        </h2>
                        {isCurrentHour && <span className="text-[9px] font-medium uppercase tracking-wide text-primary">Now</span>}
                      </div>
                      <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
                        {group.prompts.length} message{group.prompts.length === 1 ? '' : 's'} · {group.sessionCount} session{group.sessionCount === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div>
                      {group.prompts.map((prompt) => {
                        const location = prompt.cwd || prompt.sessionPath
                        return (
                          <button
                            key={prompt.id}
                            type="button"
                            className="group grid w-full min-w-0 grid-cols-[3.75rem_minmax(0,1fr)] gap-x-3 border-b border-border/40 px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35 sm:grid-cols-[4rem_minmax(0,12rem)_minmax(0,1fr)] lg:grid-cols-[4.5rem_minmax(0,15rem)_minmax(0,1fr)]"
                            onClick={() => showPrompt(prompt)}
                            title={prompt.text}
                          >
                            <time
                              dateTime={prompt.timestamp}
                              className="pt-0.5 text-[10px] font-medium tabular-nums text-muted-foreground group-hover:text-foreground"
                            >
                              {formatMinute(prompt.minuteOfDay)}
                            </time>

                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium text-foreground" title={prompt.sessionName}>
                                {prompt.sessionName}
                              </span>
                              <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[9px] text-muted-foreground" title={location}>
                                <FolderOpen className="h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="truncate">{location}</span>
                              </span>
                            </span>

                            <span className="col-span-2 mt-1 min-w-0 text-[11px] leading-5 text-foreground/85 sm:col-span-1 sm:mt-0">
                              <span className="line-clamp-2 break-words">{prompt.preview}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          )}

          {failedSessions > 0 && !error && (
            <div className="pointer-events-none absolute bottom-3 right-3 z-20 rounded border border-warning/30 bg-background/95 px-2.5 py-1.5 text-[10px] text-muted-foreground shadow-sm">
              {failedSessions} session{failedSessions === 1 ? '' : 's'} could not be read
            </div>
          )}
        </section>
      </main>

      {selectedPrompt && (
        <div
          className="fixed inset-0 z-[580] flex items-center justify-center bg-background/80 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedPrompt(null)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Message details"
            className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                  User message
                </div>
                <h2 className="mt-1.5 truncate text-sm font-semibold" title={selectedPrompt.sessionName}>{selectedPrompt.sessionName}</h2>
                <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
                  {dateLabel} · {promptTimeFormatter.format(new Date(selectedPrompt.timestamp))}
                </p>
              </div>
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                onClick={() => setSelectedPrompt(null)}
                aria-label="Close message details"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">{selectedPrompt.text}</pre>
              <div className="mt-4 border-t border-border/60 pt-3 text-[10px] leading-5 text-muted-foreground">
                <div className="font-medium text-foreground">Session path</div>
                <div className="break-all" title={selectedPrompt.sessionPath}>{selectedPrompt.sessionPath}</div>
              </div>
              {detailError && (
                <p className="mt-3 rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">{detailError}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded border border-border bg-background px-3 text-xs font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                onClick={copyPrompt}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy message'}
              </button>
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                onClick={openSession}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Open session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
