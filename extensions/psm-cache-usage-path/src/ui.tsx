/* @jsxRuntime classic */
/* @jsx React.createElement */

import type { PointerEvent as ReactPointerEvent } from 'react'
import type { PsmPluginI18nClient } from '../../../packages/runtime-sdk/src'

import {
  formatInt,
  formatPercent,
  type CacheUsageMessageStat,
  type CacheUsageStats,
  collectCacheUsageStats,
} from './cache-usage'
import { hostReact } from './host-react'

const React = hostReact()
const { useEffect, useMemo, useRef, useState } = React

type CacheUsageTab = 'trend' | 'stats' | 'recent'
type CacheUsageTrendView = 'per-turn' | 'cumulative-percent' | 'cumulative-total'

interface SessionsClientLike {
  readEntries(sessionPath: string, options?: { limit?: number }): Promise<unknown[]>
}

interface SessionLike {
  path: string
  name?: string
}

interface CacheUsageToolbarButtonProps {
  i18n: PsmPluginI18nClient
  open: boolean
  onToggle(): void
}

interface CacheUsagePanelProps {
  client: SessionsClientLike
  i18n: PsmPluginI18nClient
  session: SessionLike
  activeEntryId?: string | null
  open: boolean
  width?: number
  onWidthChange?(width: number): void
  recentTurns: number
  onClose(): void
}

const MIN_PANEL_WIDTH = 320
const MAX_PANEL_WIDTH = 620
const CHART_HEIGHT = 170

function toolbarButtonClass(open: boolean) {
  return `inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
    open
      ? 'border-primary/35 bg-primary/12 text-foreground hover:bg-primary/16'
      : 'border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground'
  }`
}

function iconButtonClass() {
  return 'inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border/70 bg-secondary px-2 text-muted-foreground hover:bg-secondary-hover hover:text-foreground'
}

function tabButtonClass(active: boolean) {
  return `inline-flex h-7 items-center rounded-md border px-2.5 text-[11px] font-medium transition-colors ${
    active
      ? 'border-primary/30 bg-primary/12 text-foreground'
      : 'border-transparent bg-transparent text-muted-foreground hover:border-border/60 hover:bg-background/25 hover:text-foreground'
  }`
}

function statCardTone(value: number) {
  if (value > 0) return 'text-emerald-300 border-emerald-500/20 bg-emerald-500/8'
  if (value < 0) return 'text-amber-300 border-amber-500/20 bg-amber-500/8'
  return 'text-foreground border-border/60 bg-background/35'
}

function formatTimestamp(value: string, language: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(language || undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function providerModelLabel(message: CacheUsageMessageStat, fallback: string) {
  const label = [message.provider, message.model].filter(Boolean).join('/')
  return label || message.model || fallback
}

function deltaTotals(stats: CacheUsageStats) {
  return {
    input: stats.treeTotals.input - stats.activeBranchTotals.input,
    output: stats.treeTotals.output - stats.activeBranchTotals.output,
    cacheRead: stats.treeTotals.cacheRead - stats.activeBranchTotals.cacheRead,
    cacheWrite: stats.treeTotals.cacheWrite - stats.activeBranchTotals.cacheWrite,
    promptTotal: stats.treeTotals.promptTotal - stats.activeBranchTotals.promptTotal,
    tokenTotal: stats.treeTotals.tokenTotal - stats.activeBranchTotals.tokenTotal,
    assistantMessages: stats.treeTotals.assistantMessages - stats.activeBranchTotals.assistantMessages,
  }
}

function bucketAverage(values: number[], bucketCount: number) {
  if (values.length <= bucketCount) return [...values]
  const result: number[] = []
  for (let index = 0; index < bucketCount; index += 1) {
    const start = Math.floor((index * values.length) / bucketCount)
    const end = Math.floor(((index + 1) * values.length) / bucketCount)
    const slice = values.slice(start, Math.max(start + 1, end))
    const sum = slice.reduce((total, value) => total + value, 0)
    result.push(sum / slice.length)
  }
  return result
}

function bucketLast(values: number[], bucketCount: number) {
  if (values.length <= bucketCount) return [...values]
  const result: number[] = []
  for (let index = 0; index < bucketCount; index += 1) {
    const start = Math.floor((index * values.length) / bucketCount)
    const end = Math.floor(((index + 1) * values.length) / bucketCount)
    const slice = values.slice(start, Math.max(start + 1, end))
    result.push(slice[slice.length - 1] ?? 0)
  }
  return result
}

function chartGeometry(points: number, width: number, height: number) {
  const innerWidth = Math.max(1, width - 28)
  const step = points <= 1 ? innerWidth : innerWidth / (points - 1)
  return { innerWidth, step, left: 14, bottom: height - 20, top: 10 }
}

function renderYAxis(maxValue: number, width: number, height: number, locale: string) {
  const rows = [0, 0.25, 0.5, 0.75, 1]
  return rows.map((ratio) => {
    const y = 10 + (1 - ratio) * (height - 30)
    const labelValue = maxValue * ratio
    return (
      <g key={`y-${ratio}`}>
        <line x1={14} x2={width - 8} y1={y} y2={y} stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
        <text x={0} y={y + 4} fill="rgba(148,163,184,0.72)" fontSize="10">
          {formatInt(labelValue, locale)}
        </text>
      </g>
    )
  })
}

function PercentBarChart({ values, width, locale }: { values: number[]; width: number; locale: string }) {
  const chartWidth = Math.max(220, width - 36)
  const geometry = chartGeometry(Math.max(values.length, 1), chartWidth, CHART_HEIGHT)
  const barWidth = Math.max(5, Math.min(20, geometry.innerWidth / Math.max(values.length, 1) - 2))

  return (
    <svg viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} className="h-[170px] w-full overflow-visible">
      {renderYAxis(100, chartWidth, CHART_HEIGHT, locale)}
      {values.map((value, index) => {
        const x = geometry.left + index * (barWidth + 2)
        const height = ((Math.max(0, value) / 100) * (geometry.bottom - geometry.top))
        const y = geometry.bottom - height
        return (
          <rect
            key={`bar-${index}`}
            x={x}
            y={y}
            width={barWidth}
            height={Math.max(2, height)}
            rx="2"
            fill="rgba(74, 222, 128, 0.8)"
          />
        )
      })}
      <line x1={14} x2={chartWidth - 8} y1={geometry.bottom} y2={geometry.bottom} stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
    </svg>
  )
}

function PercentLineChart({ values, width, locale }: { values: number[]; width: number; locale: string }) {
  const chartWidth = Math.max(220, width - 36)
  const geometry = chartGeometry(Math.max(values.length, 1), chartWidth, CHART_HEIGHT)
  const points = values.map((value, index) => {
    const x = geometry.left + geometry.step * index
    const y = geometry.bottom - ((Math.max(0, Math.min(100, value)) / 100) * (geometry.bottom - geometry.top))
    return `${x},${y}`
  })

  return (
    <svg viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} className="h-[170px] w-full overflow-visible">
      {renderYAxis(100, chartWidth, CHART_HEIGHT, locale)}
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="rgba(74, 222, 128, 0.9)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((point, index) => {
        const [cx, cy] = point.split(',')
        return <circle key={`dot-${index}`} cx={cx} cy={cy} r="2.5" fill="rgba(74, 222, 128, 0.95)" />
      })}
      <line x1={14} x2={chartWidth - 8} y1={geometry.bottom} y2={geometry.bottom} stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
    </svg>
  )
}

function StackedTotalsChart({ input, cacheWrite, cacheRead, width, locale }: {
  input: number[]
  cacheWrite: number[]
  cacheRead: number[]
  width: number
  locale: string
}) {
  const chartWidth = Math.max(220, width - 36)
  const geometry = chartGeometry(Math.max(input.length, 1), chartWidth, CHART_HEIGHT)
  const barWidth = Math.max(6, Math.min(18, geometry.innerWidth / Math.max(input.length, 1) - 2))
  const totals = input.map((value, index) => value + cacheWrite[index]! + cacheRead[index]!)
  const maxValue = Math.max(...totals, 1)

  return (
    <svg viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`} className="h-[170px] w-full overflow-visible">
      {renderYAxis(maxValue, chartWidth, CHART_HEIGHT, locale)}
      {input.map((value, index) => {
        const x = geometry.left + index * (barWidth + 2)
        const scale = (geometry.bottom - geometry.top) / maxValue
        const inputHeight = value * scale
        const writeHeight = cacheWrite[index]! * scale
        const readHeight = cacheRead[index]! * scale
        const inputY = geometry.bottom - inputHeight
        const writeY = inputY - writeHeight
        const readY = writeY - readHeight
        return (
          <g key={`stack-${index}`}>
            <rect x={x} y={inputY} width={barWidth} height={Math.max(2, inputHeight)} fill="rgba(148,163,184,0.55)" rx="2" />
            <rect x={x} y={writeY} width={barWidth} height={Math.max(2, writeHeight)} fill="rgba(251,191,36,0.78)" rx="2" />
            <rect x={x} y={readY} width={barWidth} height={Math.max(2, readHeight)} fill="rgba(74,222,128,0.82)" rx="2" />
          </g>
        )
      })}
      <line x1={14} x2={chartWidth - 8} y1={geometry.bottom} y2={geometry.bottom} stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
    </svg>
  )
}

function DeltaValue({ value, locale }: { value: number; locale: string }) {
  const sign = value > 0 ? '+' : ''
  const tone = value > 0 ? 'text-emerald-300' : value < 0 ? 'text-amber-300' : 'text-muted-foreground'
  return <span className={`font-mono ${tone}`}>{sign}{formatInt(value, locale)}</span>
}

function StatSection({
  title,
  totals,
  locale,
  t,
  delta = false,
}: {
  title: string
  totals: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    promptTotal: number
    tokenTotal: number
    assistantMessages: number
  }
  locale: string
  t: PsmPluginI18nClient['t']
  delta?: boolean
}) {
  const renderValue = (value: number) => delta
    ? <DeltaValue value={value} locale={locale} />
    : <span className="font-mono text-foreground">{formatInt(value, locale)}</span>

  return (
    <section className="border border-border/60 bg-background/35 p-3">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{title}</div>
      <div className="space-y-2 text-xs">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.assistantMessages', 'Assistant turns')}</span>{renderValue(totals.assistantMessages)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.input', 'Input (uncached)')}</span>{renderValue(totals.input)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.cacheRead', 'Cache hit')}</span>{renderValue(totals.cacheRead)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.cacheWrite', 'Cache write')}</span>{renderValue(totals.cacheWrite)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.promptTotal', 'Prompt total')}</span>{renderValue(totals.promptTotal)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.output', 'Output')}</span>{renderValue(totals.output)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.tokenTotal', 'Token total')}</span>{renderValue(totals.tokenTotal)}</div>
      </div>
    </section>
  )
}

export function CacheUsageToolbarButton({ i18n, open, onToggle }: CacheUsageToolbarButtonProps) {
  const { t } = i18n
  return (
    <button
      type="button"
      onClick={onToggle}
      className={toolbarButtonClass(open)}
      title={t('session.cacheUsage.title', 'Cache usage')}
      aria-label={t('session.cacheUsage.title', 'Cache usage')}
      aria-expanded={open}
    >
      <span className="font-medium">{t('session.cacheUsage.shortLabel', 'Cache')}</span>
    </button>
  )
}

export function CacheUsagePanel({
  client,
  i18n,
  session,
  activeEntryId,
  open,
  width = 360,
  onWidthChange,
  recentTurns,
  onClose,
}: CacheUsagePanelProps) {
  const { t, language } = i18n
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<CacheUsageStats | null>(null)
  const [activeTab, setActiveTab] = useState<CacheUsageTab>('trend')
  const [trendView, setTrendView] = useState<CacheUsageTrendView>('per-turn')
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartRef = useRef<{ x: number; width: number } | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)
    setError(null)

    client.readEntries(session.path)
      .then((entries) => {
        if (cancelled) return
        setStats(collectCacheUsageStats(entries as any[], { activeEntryId }))
      })
      .catch((nextError) => {
        if (cancelled) return
        setError(nextError instanceof Error ? nextError.message : String(nextError))
        setStats(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeEntryId, client, open, session.path])

  useEffect(() => {
    if (!isResizing) return

    const handlePointerMove = (event: PointerEvent) => {
      const start = resizeStartRef.current
      if (!start) return
      const delta = start.x - event.clientX
      const nextWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, start.width + delta))
      onWidthChange?.(nextWidth)
    }

    const handlePointerUp = () => {
      setIsResizing(false)
      resizeStartRef.current = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isResizing, onWidthChange])

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStartRef.current = { x: event.clientX, width }
    setIsResizing(true)
  }

  const handleRefresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const entries = await client.readEntries(session.path)
      setStats(collectCacheUsageStats(entries as any[], { activeEntryId }))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
      setStats(null)
    } finally {
      setLoading(false)
    }
  }

  const chartBucketCount = Math.max(10, Math.min(28, Math.floor((width - 48) / 11)))

  const trendData = useMemo(() => {
    if (!stats) return null

    if (trendView === 'per-turn') {
      return {
        kind: 'bars' as const,
        values: bucketAverage(stats.series.hitRates, chartBucketCount),
      }
    }

    if (trendView === 'cumulative-percent') {
      return {
        kind: 'line' as const,
        values: bucketLast(stats.series.cumulativeHitRates, chartBucketCount),
      }
    }

    return {
      kind: 'stacked' as const,
      input: bucketLast(stats.series.cumulativeInput, chartBucketCount),
      cacheWrite: bucketLast(stats.series.cumulativeCacheWrite, chartBucketCount),
      cacheRead: bucketLast(stats.series.cumulativeCacheRead, chartBucketCount),
    }
  }, [chartBucketCount, stats, trendView])

  const recentMessages = useMemo(() => {
    if (!stats) return []
    return stats.messages.slice(-recentTurns).reverse()
  }, [recentTurns, stats])

  if (!open) return null

  const branchTitle = activeEntryId
    ? t('session.cacheUsage.activeBranch', 'Active branch')
    : t('session.cacheUsage.latestBranch', 'Latest branch')
  const branchHint = activeEntryId
    ? t('session.cacheUsage.activeBranchHint', 'Active branch follows the entry currently selected in the viewer.')
    : t('session.cacheUsage.branchHint', 'Latest branch is inferred from the newest message lineage in this session file.')
  const branchSpread = stats ? stats.activeBranchHitRate - stats.treeHitRate : 0
  const latestHitRate = stats?.activeBranchHitRate ?? 0
  const treeHitRate = stats?.treeHitRate ?? 0
  const latestHitTone = statCardTone(latestHitRate)
  const treeHitTone = statCardTone(treeHitRate)
  const spreadTone = statCardTone(branchSpread)
  const latestPoint = stats?.messages[stats.messages.length - 1]?.hitRate ?? 0
  const minHit = stats?.messages.length ? Math.min(...stats.messages.map((message) => message.hitRate)) : 0
  const maxHit = stats?.messages.length ? Math.max(...stats.messages.map((message) => message.hitRate)) : 0

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-surface-dark/75" data-no-window-drag>
      <div
        onPointerDown={handleResizeStart}
        className={`absolute -left-[3px] top-0 h-full w-[6px] cursor-ew-resize ${isResizing ? 'bg-info/40' : 'hover:bg-info/20'}`}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('session.cacheUsage.title', 'Cache usage')}
      />

      <div className="border-b border-border/70 bg-background/30 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-foreground/92">
              {t('session.cacheUsage.title', 'Cache usage')}
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">{session.name || session.path}</div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              className={iconButtonClass()}
              aria-label={t('session.cacheUsage.refresh', 'Refresh cache usage')}
              title={t('session.cacheUsage.refresh', 'Refresh cache usage')}
            >
              ↻
            </button>
            <button
              type="button"
              onClick={onClose}
              className={iconButtonClass()}
              aria-label={t('session.cacheUsage.close', 'Close cache usage panel')}
            >
              ×
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className={`border px-2.5 py-2 ${latestHitTone}`}>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{branchTitle}</div>
            <div className="mt-1 text-base font-semibold">{formatPercent(latestHitRate, language)}</div>
          </div>
          <div className={`border px-2.5 py-2 ${treeHitTone}`}>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t('session.cacheUsage.wholeTree', 'Whole tree')}</div>
            <div className="mt-1 text-base font-semibold">{formatPercent(treeHitRate, language)}</div>
          </div>
          <div className={`border px-2.5 py-2 ${spreadTone}`}>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{t('session.cacheUsage.spread', 'Spread')}</div>
            <div className="mt-1 text-base font-semibold">{branchSpread > 0 ? '+' : ''}{formatPercent(branchSpread, language)}</div>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-muted-foreground">{t('session.cacheUsage.formula', 'cacheRead / (input + cacheRead + cacheWrite)')}</div>
      </div>

      <div className="border-b border-border/60 bg-background/15 px-2 py-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setActiveTab('trend')} className={tabButtonClass(activeTab === 'trend')}>{t('session.cacheUsage.tabs.trend', 'Trend')}</button>
          <button type="button" onClick={() => setActiveTab('stats')} className={tabButtonClass(activeTab === 'stats')}>{t('session.cacheUsage.tabs.stats', 'Stats')}</button>
          <button type="button" onClick={() => setActiveTab('recent')} className={tabButtonClass(activeTab === 'recent')}>{t('session.cacheUsage.tabs.recent', 'Recent')}</button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="px-3 py-3 text-sm text-muted-foreground">{t('session.cacheUsage.loading', 'Loading cache usage...')}</div>
        ) : error ? (
          <div className="m-3 border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        ) : !stats || stats.assistantMessages === 0 ? (
          <div className="m-3 border border-border/60 bg-background/45 px-3 py-3 text-sm text-muted-foreground">
            <p>{t('session.cacheUsage.empty', 'No assistant usage metrics found in this session.')}</p>
            <p className="mt-2 text-xs text-muted-foreground/80">{branchHint}</p>
          </div>
        ) : activeTab === 'trend' ? (
          <div className="px-3 py-3">
            <div className="mb-3 flex flex-wrap items-center gap-1">
              <button type="button" onClick={() => setTrendView('per-turn')} className={tabButtonClass(trendView === 'per-turn')}>{t('session.cacheUsage.views.perTurn', 'Per-turn %')}</button>
              <button type="button" onClick={() => setTrendView('cumulative-percent')} className={tabButtonClass(trendView === 'cumulative-percent')}>{t('session.cacheUsage.views.cumulativePercent', 'Cum %')}</button>
              <button type="button" onClick={() => setTrendView('cumulative-total')} className={tabButtonClass(trendView === 'cumulative-total')}>{t('session.cacheUsage.views.cumulativeTotal', 'Cum total')}</button>
            </div>

            <div className="border border-border/60 bg-background/35 px-2 py-2">
              {trendData?.kind === 'bars' ? (
                <PercentBarChart values={trendData.values} width={width} locale={language} />
              ) : trendData?.kind === 'line' ? (
                <PercentLineChart values={trendData.values} width={width} locale={language} />
              ) : trendData?.kind === 'stacked' ? (
                <>
                  <StackedTotalsChart
                    input={trendData.input}
                    cacheWrite={trendData.cacheWrite}
                    cacheRead={trendData.cacheRead}
                    width={width}
                    locale={language}
                  />
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span><span className="mr-1 inline-block h-2.5 w-2.5 bg-slate-400/70" />{t('session.cacheUsage.stats.input', 'Input (uncached)')}</span>
                    <span><span className="mr-1 inline-block h-2.5 w-2.5 bg-amber-300/80" />{t('session.cacheUsage.stats.cacheWrite', 'Cache write')}</span>
                    <span><span className="mr-1 inline-block h-2.5 w-2.5 bg-emerald-300/80" />{t('session.cacheUsage.stats.cacheRead', 'Cache hit')}</span>
                  </div>
                </>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="border border-border/60 bg-background/35 px-2.5 py-2"><div className="text-muted-foreground">{t('session.cacheUsage.summary.latest', 'Latest')}</div><div className="mt-1 font-mono text-foreground">{formatPercent(latestPoint, language)}</div></div>
              <div className="border border-border/60 bg-background/35 px-2.5 py-2"><div className="text-muted-foreground">{t('session.cacheUsage.summary.min', 'Min')}</div><div className="mt-1 font-mono text-foreground">{formatPercent(minHit, language)}</div></div>
              <div className="border border-border/60 bg-background/35 px-2.5 py-2"><div className="text-muted-foreground">{t('session.cacheUsage.summary.max', 'Max')}</div><div className="mt-1 font-mono text-foreground">{formatPercent(maxHit, language)}</div></div>
              <div className="border border-border/60 bg-background/35 px-2.5 py-2"><div className="text-muted-foreground">{t('session.cacheUsage.summary.turns', 'Turns')}</div><div className="mt-1 font-mono text-foreground">{formatInt(stats.messages.length, language)}</div></div>
            </div>

            <div className="mt-3 text-[11px] text-muted-foreground">{branchHint}</div>
          </div>
        ) : activeTab === 'stats' ? (
          <div className="space-y-3 px-3 py-3">
            <StatSection title={branchTitle} totals={stats.activeBranchTotals} locale={language} t={t} />
            <StatSection title={t('session.cacheUsage.stats.wholeTree', 'Whole tree')} totals={stats.treeTotals} locale={language} t={t} />
            <StatSection title={t('session.cacheUsage.stats.delta', 'Delta')} totals={deltaTotals(stats)} locale={language} t={t} delta />
          </div>
        ) : (
          <div className="px-3 py-3">
            <div className="mb-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{t('session.cacheUsage.recentTurns', 'Recent {{count}} turns', { count: recentMessages.length })}</div>
            {recentMessages.length > 0 ? (
              <div className="space-y-2">
                {recentMessages.map((message) => (
                  <div key={message.id} className="border border-border/60 bg-background/35 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">{t('session.cacheUsage.sequence', '#{{value}}', { value: message.sequence })}</span>
                          {message.isOnActiveBranch && (
                            <span className="border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-foreground">{t('session.cacheUsage.branchBadge', 'Latest branch')}</span>
                          )}
                          <span className="truncate text-sm font-medium text-foreground">{providerModelLabel(message, t('session.cacheUsage.modelFallback', 'assistant'))}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{formatTimestamp(message.timestamp, language)}</div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                          <span>{t('session.cacheUsage.stats.input', 'Input (uncached)')}: <span className="font-mono text-foreground">{formatInt(message.input, language)}</span></span>
                          <span>{t('session.cacheUsage.stats.output', 'Output')}: <span className="font-mono text-foreground">{formatInt(message.output, language)}</span></span>
                          <span>{t('session.cacheUsage.stats.cacheRead', 'Cache hit')}: <span className="font-mono text-emerald-300">{formatInt(message.cacheRead, language)}</span></span>
                          <span>{t('session.cacheUsage.stats.cacheWrite', 'Cache write')}: <span className="font-mono text-foreground">{formatInt(message.cacheWrite, language)}</span></span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-semibold text-emerald-300">{formatPercent(message.hitRate, language)}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{t('session.cacheUsage.stats.promptTotal', 'Prompt total')}: {formatInt(message.promptTotal, language)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-border/60 bg-background/45 px-3 py-3 text-sm text-muted-foreground">
                {t('session.cacheUsage.noRecentTurns', 'No recent assistant turns.')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
