/* @jsxRuntime classic */
/* @jsx React.createElement */

import type { PsmPluginI18nClient } from '../../../packages/runtime-sdk/src'
import {
  SessionPluginPanel,
  SessionPluginPanelBody,
  SessionPluginPanelHeader,
  SessionPluginPanelState,
  sessionPluginPanelIconButtonClass,
} from '../../../src/components/session-viewer/SessionPluginPanel'

import {
  formatInt,
  formatPercent,
  type CacheUsageInsight,
  type CacheUsageMessageStat,
  type CacheUsageModelStat,
  type CacheUsageReason,
  type CacheUsageStats,
  collectCacheUsageStats,
} from './cache-usage'
import { hostReact } from './host-react'

const React = hostReact()
const { useEffect, useMemo, useRef, useState } = React

type CacheUsageTab = 'overview' | 'trend' | 'stats' | 'recent'
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

const CHART_HEIGHT = 170

function toolbarButtonClass(open: boolean) {
  return `inline-flex h-7 items-center gap-1.5 border px-2 text-xs transition-colors ${
    open
      ? 'border-primary/35 bg-primary/10 text-foreground'
      : 'border-border/70 bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
  }`
}

function iconButtonClass() {
  return 'inline-flex h-7 min-w-7 items-center justify-center border border-border/70 bg-transparent px-2 text-muted-foreground hover:bg-secondary hover:text-foreground'
}

function tabButtonClass(active: boolean) {
  return `inline-flex h-8 items-center border-b-2 px-2 text-[11px] font-medium transition-colors ${
    active
      ? 'border-primary text-foreground'
      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
  }`
}

function metricTone(value: number) {
  if (value > 0) return 'border-l-2 border-primary/70'
  if (value < 0) return 'border-l-2 border-warning/80'
  return 'border-l-2 border-border'
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

function formatCost(value: number, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale || undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 0 && value < 0.01 ? 6 : 4,
    maximumFractionDigits: value > 0 && value < 0.01 ? 6 : 4,
  }).format(value)
}

function formatSignedPercent(value: number, locale: string) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatPercent(value, locale)}`
}

function formatSignedCost(value: number, locale: string) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}${formatCost(Math.abs(value), locale)}`
}

function providerModelLabel(message: CacheUsageMessageStat, fallback: string) {
  const label = [message.provider, message.model].filter(Boolean).join('/')
  return label || message.model || fallback
}

function reasonLabel(reason: CacheUsageReason, t: PsmPluginI18nClient['t']) {
  switch (reason) {
    case 'model-switch':
      return t('session.cacheUsage.reasons.modelSwitch', 'Model switch')
    case 'first-cache-write':
      return t('session.cacheUsage.reasons.firstCacheWrite', 'First write')
    case 'cache-write-spike':
      return t('session.cacheUsage.reasons.cacheWriteSpike', 'Write spike')
    case 'hit-rate-drop':
      return t('session.cacheUsage.reasons.hitRateDrop', 'Hit drop')
    case 'cost-unknown':
      return t('session.cacheUsage.reasons.costUnknown', 'Cost unknown')
    default:
      return reason
  }
}

function insightTitle(insight: CacheUsageInsight, t: PsmPluginI18nClient['t']) {
  switch (insight.kind) {
    case 'model-switch':
      return t('session.cacheUsage.insights.modelSwitch', 'Model switch changed cache behavior')
    case 'hit-rate-drop':
      return t('session.cacheUsage.insights.hitRateDrop', 'Cache hit rate dropped')
    case 'cache-write-spike':
      return t('session.cacheUsage.insights.cacheWriteSpike', 'Cache write spike detected')
    case 'first-cache-write':
      return t('session.cacheUsage.insights.firstCacheWrite', 'Cache started being written')
    case 'branch-gap':
      return t('session.cacheUsage.insights.branchGap', 'Branch and tree diverge')
    case 'cost-missing':
      return t('session.cacheUsage.insights.costMissing', 'Cost data is incomplete')
    case 'high-cost':
      return t('session.cacheUsage.insights.highCost', 'Highest recorded cost turn')
    default:
      return insight.kind
  }
}

function insightTone(severity: CacheUsageInsight['severity']) {
  if (severity === 'warning') return 'border-l-2 border-warning/80'
  if (severity === 'success') return 'border-l-2 border-primary/70'
  return 'border-l-2 border-info/70'
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
    cost: {
      input: stats.treeTotals.cost.input - stats.activeBranchTotals.cost.input,
      output: stats.treeTotals.cost.output - stats.activeBranchTotals.cost.output,
      cacheRead: stats.treeTotals.cost.cacheRead - stats.activeBranchTotals.cost.cacheRead,
      cacheWrite: stats.treeTotals.cost.cacheWrite - stats.activeBranchTotals.cost.cacheWrite,
      total: stats.treeTotals.cost.total - stats.activeBranchTotals.cost.total,
      knownMessages: stats.treeTotals.cost.knownMessages - stats.activeBranchTotals.cost.knownMessages,
      unknownMessages: stats.treeTotals.cost.unknownMessages - stats.activeBranchTotals.cost.unknownMessages,
    },
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
        <line x1={14} x2={width - 8} y1={y} y2={y} className="stroke-muted/20" strokeWidth="1" />
        <text x={0} y={y + 4} className="fill-muted-foreground/70" fontSize="10">
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
            className="fill-primary/70"
          />
        )
      })}
      <line x1={14} x2={chartWidth - 8} y1={geometry.bottom} y2={geometry.bottom} className="stroke-muted/30" strokeWidth="1" />
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
        className="stroke-primary/70"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((point, index) => {
        const [cx, cy] = point.split(',')
        return <circle key={`dot-${index}`} cx={cx} cy={cy} r="2.5" className="fill-primary/70" />
      })}
      <line x1={14} x2={chartWidth - 8} y1={geometry.bottom} y2={geometry.bottom} className="stroke-muted/30" strokeWidth="1" />
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
            <rect x={x} y={inputY} width={barWidth} height={Math.max(2, inputHeight)} className="fill-muted" rx="2" />
            <rect x={x} y={writeY} width={barWidth} height={Math.max(2, writeHeight)} className="fill-warning" rx="2" />
            <rect x={x} y={readY} width={barWidth} height={Math.max(2, readHeight)} className="fill-primary/70" rx="2" />
          </g>
        )
      })}
      <line x1={14} x2={chartWidth - 8} y1={geometry.bottom} y2={geometry.bottom} className="stroke-muted/30" strokeWidth="1" />
    </svg>
  )
}

function DeltaValue({ value, locale }: { value: number; locale: string }) {
  const sign = value > 0 ? '+' : ''
  const tone = value > 0 ? 'text-success' : value < 0 ? 'text-warning' : 'text-muted-foreground'
  return <span className={`font-mono ${tone}`}>{sign}{formatInt(value, locale)}</span>
}

function CostValue({
  value,
  knownMessages,
  unknownMessages,
  locale,
  t,
  delta = false,
}: {
  value: number
  knownMessages: number
  unknownMessages: number
  locale: string
  t: PsmPluginI18nClient['t']
  delta?: boolean
}) {
  const text = knownMessages > 0
    ? delta ? formatSignedCost(value, locale) : formatCost(value, locale)
    : t('session.cacheUsage.cost.unknown', 'Unknown')
  const tone = unknownMessages > 0 && knownMessages === 0
    ? 'text-warning'
    : delta && value < 0
      ? 'text-warning'
      : delta && value > 0
        ? 'text-success'
        : 'text-foreground'

  return <span className={`font-mono ${tone}`}>{text}</span>
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
    cost: CacheUsageStats['treeTotals']['cost']
  }
  locale: string
  t: PsmPluginI18nClient['t']
  delta?: boolean
}) {
  const renderValue = (value: number) => delta
    ? <DeltaValue value={value} locale={locale} />
    : <span className="font-mono text-foreground">{formatInt(value, locale)}</span>

  return (
    <section className="border-b border-border/70 pb-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="space-y-2 text-xs">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.assistantMessages', 'Assistant turns')}</span>{renderValue(totals.assistantMessages)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.input', 'Input (uncached)')}</span>{renderValue(totals.input)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.cacheRead', 'Cache hit')}</span>{renderValue(totals.cacheRead)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.cacheWrite', 'Cache write')}</span>{renderValue(totals.cacheWrite)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.promptTotal', 'Prompt total')}</span>{renderValue(totals.promptTotal)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.output', 'Output')}</span>{renderValue(totals.output)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span className="text-muted-foreground">{t('session.cacheUsage.stats.tokenTotal', 'Token total')}</span>{renderValue(totals.tokenTotal)}</div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
          <span className="text-muted-foreground">{t('session.cacheUsage.cost.recorded', 'Recorded cost')}</span>
          <CostValue
            value={totals.cost.total}
            knownMessages={totals.cost.knownMessages}
            unknownMessages={totals.cost.unknownMessages}
            locale={locale}
            t={t}
            delta={delta}
          />
        </div>
        {totals.cost.unknownMessages > 0 && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <span className="text-muted-foreground">{t('session.cacheUsage.cost.unknownTurns', 'Unknown cost turns')}</span>
            {renderValue(totals.cost.unknownMessages)}
          </div>
        )}
      </div>
    </section>
  )
}

function CostSummary({ stats, locale, t }: { stats: CacheUsageStats; locale: string; t: PsmPluginI18nClient['t'] }) {
  const known = stats.treeTotals.cost.knownMessages
  const total = stats.treeTotals.assistantMessages
  const coverage = total > 0 ? (known / total) * 100 : 0

  return (
    <section className="border-b border-border/70 pb-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{t('session.cacheUsage.cost.title', 'Cost analysis')}</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border-l border-border/70 px-2.5 py-2">
          <div className="text-muted-foreground">{t('session.cacheUsage.cost.activeBranch', 'Branch cost')}</div>
          <div className="mt-1">
            <CostValue value={stats.activeBranchTotals.cost.total} knownMessages={stats.activeBranchTotals.cost.knownMessages} unknownMessages={stats.activeBranchTotals.cost.unknownMessages} locale={locale} t={t} />
          </div>
        </div>
        <div className="border-l border-border/70 px-2.5 py-2">
          <div className="text-muted-foreground">{t('session.cacheUsage.cost.wholeTree', 'Tree cost')}</div>
          <div className="mt-1">
            <CostValue value={stats.treeTotals.cost.total} knownMessages={stats.treeTotals.cost.knownMessages} unknownMessages={stats.treeTotals.cost.unknownMessages} locale={locale} t={t} />
          </div>
        </div>
        <div className="border-l border-border/70 px-2.5 py-2">
          <div className="text-muted-foreground">{t('session.cacheUsage.cost.coverage', 'Cost coverage')}</div>
          <div className="mt-1 font-mono text-foreground">{formatPercent(coverage, locale)}</div>
        </div>
        <div className="border-l border-border/70 px-2.5 py-2">
          <div className="text-muted-foreground">{t('session.cacheUsage.cost.unknownTurns', 'Unknown cost turns')}</div>
          <div className="mt-1 font-mono text-warning">{formatInt(stats.treeTotals.cost.unknownMessages, locale)}</div>
        </div>
      </div>
    </section>
  )
}

function ModelStatsTable({ models, locale, t }: { models: CacheUsageModelStat[]; locale: string; t: PsmPluginI18nClient['t'] }) {
  if (models.length === 0) return null

  return (
    <section className="border-b border-border/70 pb-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-muted-foreground">{t('session.cacheUsage.models.title', 'Model breakdown')}</div>
        <div className="text-[11px] text-muted-foreground">{t('session.cacheUsage.models.count', '{{count}} models', { count: models.length })}</div>
      </div>
      <div className="space-y-2">
        {models.slice(0, 6).map((model) => (
          <div key={model.key} className="border-l-2 border-border/70 bg-transparent px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{model.label}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {t('session.cacheUsage.models.turnRange', '#{{first}}-#{{last}}', { first: model.firstSequence, last: model.lastSequence })}
                  {model.switchesIn > 0 ? ` - ${t('session.cacheUsage.models.switchesIn', '{{count}} switch-in', { count: model.switchesIn })}` : ''}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-sm text-foreground">{formatPercent(model.hitRate, locale)}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{formatInt(model.assistantMessages, locale)} {t('session.cacheUsage.summary.turns', 'Turns')}</div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
              <span>{t('session.cacheUsage.stats.promptTotal', 'Prompt total')}: <span className="font-mono text-foreground">{formatInt(model.promptTotal, locale)}</span></span>
              <span>{t('session.cacheUsage.stats.cacheRead', 'Cache hit')}: <span className="font-mono text-foreground">{formatInt(model.cacheRead, locale)}</span></span>
              <span>{t('session.cacheUsage.cost.recorded', 'Recorded cost')}: <CostValue value={model.cost.total} knownMessages={model.cost.knownMessages} unknownMessages={model.cost.unknownMessages} locale={locale} t={t} /></span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function InsightCard({ insight, locale, t }: { insight: CacheUsageInsight; locale: string; t: PsmPluginI18nClient['t'] }) {
  return (
    <div className={`px-3 py-2.5 ${insightTone(insight.severity)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{insightTitle(insight, t)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {insight.sequence ? t('session.cacheUsage.sequence', '#{{value}}', { value: insight.sequence }) : t('session.cacheUsage.insights.sessionScope', 'Session scope')}
            {insight.model ? ` - ${insight.previousModel ? `${insight.previousModel} -> ` : ''}${insight.model}` : ''}
          </div>
        </div>
        {typeof insight.hitRateDelta === 'number' && (
          <div className="shrink-0 font-mono text-sm text-foreground">{formatSignedPercent(insight.hitRateDelta, locale)}</div>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        {typeof insight.hitRate === 'number' && (
          <span>{t('session.cacheUsage.insights.hitRate', 'Hit rate')}: <span className="font-mono text-foreground">{formatPercent(insight.hitRate, locale)}</span></span>
        )}
        {typeof insight.cacheWrite === 'number' && (
          <span>{t('session.cacheUsage.stats.cacheWrite', 'Cache write')}: <span className="font-mono text-foreground">{formatInt(insight.cacheWrite, locale)}</span></span>
        )}
        {typeof insight.cost === 'number' && (
          <span>{t('session.cacheUsage.cost.recorded', 'Recorded cost')}: <span className="font-mono text-foreground">{insight.costKnown ? formatCost(insight.cost, locale) : t('session.cacheUsage.cost.unknown', 'Unknown')}</span></span>
        )}
        {typeof insight.count === 'number' && (
          <span>{t('session.cacheUsage.insights.count', 'Count')}: <span className="font-mono text-foreground">{formatInt(insight.count, locale)}</span></span>
        )}
        {typeof insight.unknownCount === 'number' && (
          <span>{t('session.cacheUsage.cost.unknownTurns', 'Unknown cost turns')}: <span className="font-mono text-warning">{formatInt(insight.unknownCount, locale)}</span></span>
        )}
      </div>
    </div>
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
      aria-pressed={open}
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
  recentTurns,
  onClose,
}: CacheUsagePanelProps) {
  const { t, language } = i18n
  const [initialLoading, setInitialLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<CacheUsageStats | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [activeTab, setActiveTab] = useState<CacheUsageTab>('overview')
  const [trendView, setTrendView] = useState<CacheUsageTrendView>('per-turn')
  const loadedSessionPathRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    const replacingSession = loadedSessionPathRef.current !== session.path
    if (replacingSession) {
      setStats(null)
      setLastUpdatedAt(null)
      setInitialLoading(true)
    } else {
      setRefreshing(true)
    }
    setError(null)

    client.readEntries(session.path)
      .then((entries) => {
        if (cancelled) return
        setStats(collectCacheUsageStats(entries as any[], { activeEntryId }))
        setLastUpdatedAt(new Date())
        loadedSessionPathRef.current = session.path
      })
      .catch((nextError) => {
        if (cancelled) return
        setError(nextError instanceof Error ? nextError.message : String(nextError))
      })
      .finally(() => {
        if (!cancelled) {
          setInitialLoading(false)
          setRefreshing(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeEntryId, client, open, reloadNonce, session.path])

  const handleRefresh = () => {
    if (initialLoading || refreshing) return
    setReloadNonce((value) => value + 1)
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
  const latestHitRate = stats?.activeBranchHitRate
  const treeHitRate = stats?.treeHitRate
  const treeHitTone = metricTone(treeHitRate ?? 0)
  const spreadTone = metricTone(branchSpread)
  const latestPoint = stats?.messages[stats.messages.length - 1]?.hitRate ?? 0
  const minHit = stats?.messages.length ? Math.min(...stats.messages.map((message) => message.hitRate)) : 0
  const maxHit = stats?.messages.length ? Math.max(...stats.messages.map((message) => message.hitRate)) : 0
  const pending = initialLoading || refreshing

  return (
    <SessionPluginPanel label={t('session.cacheUsage.title', 'Cache usage')}>
      <SessionPluginPanelHeader
        title={t('session.cacheUsage.title', 'Cache usage')}
        subtitle={session.name || session.path}
        actions={
          <button
            type="button"
            onClick={handleRefresh}
            disabled={pending}
            className={`${sessionPluginPanelIconButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label={t('session.cacheUsage.refresh', 'Refresh cache usage')}
            title={t('session.cacheUsage.refresh', 'Refresh cache usage')}
          >
            ↻
          </button>
        }
        onClose={onClose}
        closeLabel={t('session.cacheUsage.close', 'Close cache usage panel')}
      />

      <div className="border-b border-border/70 px-3 py-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted-foreground">{branchTitle}</div>
            <div className="mt-0.5 text-3xl font-semibold tracking-tight text-foreground">{latestHitRate === undefined ? '—' : formatPercent(latestHitRate, language)}</div>
          </div>
          <div className={`border-l-2 px-3 py-1 text-right ${spreadTone}`}>
            <div className="text-xs font-medium text-muted-foreground">{t('session.cacheUsage.spread', 'Spread')}</div>
            <div className="mt-1 font-mono text-sm text-foreground">{stats ? `${branchSpread > 0 ? '+' : ''}${formatPercent(branchSpread, language)}` : '—'}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border/60 pt-3 text-xs">
          <div className={`border-l-2 px-2 ${treeHitTone}`}>
            <div className="text-muted-foreground">{t('session.cacheUsage.wholeTree', 'Whole tree')}</div>
            <div className="mt-0.5 font-mono text-foreground">{treeHitRate === undefined ? '—' : formatPercent(treeHitRate, language)}</div>
          </div>
          <div className="border-l-2 border-border px-2">
            <div className="text-muted-foreground">{t('session.cacheUsage.stats.promptTotal', 'Prompt total')}</div>
            <div className="mt-0.5 font-mono text-foreground">{stats ? formatInt(stats.activeBranchTotals.promptTotal, language) : '—'}</div>
          </div>
          <div className="border-l-2 border-primary/70 px-2">
            <div className="text-muted-foreground">{t('session.cacheUsage.stats.cacheRead', 'Cache hit')}</div>
            <div className="mt-0.5 font-mono text-foreground">{stats ? formatInt(stats.activeBranchTotals.cacheRead, language) : '—'}</div>
          </div>
          <div className="border-l-2 border-warning/80 px-2">
            <div className="text-muted-foreground">{t('session.cacheUsage.stats.cacheWrite', 'Cache write')}</div>
            <div className="mt-0.5 font-mono text-foreground">{stats ? formatInt(stats.activeBranchTotals.cacheWrite, language) : '—'}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
          <span>{t('session.cacheUsage.formula', 'cacheRead / (input + cacheRead + cacheWrite)')}</span>
          {lastUpdatedAt ? (
            <span className="ml-auto">{t('session.cacheUsage.updated', 'Updated {{time}}', { time: formatTimestamp(lastUpdatedAt.toISOString(), language) })}</span>
          ) : null}
        </div>
      </div>

      <nav className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border/70 px-3" aria-label={t('session.cacheUsage.title', 'Cache usage')}>
        <button type="button" onClick={() => setActiveTab('overview')} aria-pressed={activeTab === 'overview'} className={tabButtonClass(activeTab === 'overview')}>{t('session.cacheUsage.tabs.overview', 'Overview')}</button>
        <button type="button" onClick={() => setActiveTab('trend')} aria-pressed={activeTab === 'trend'} className={tabButtonClass(activeTab === 'trend')}>{t('session.cacheUsage.tabs.trend', 'Trend')}</button>
        <button type="button" onClick={() => setActiveTab('stats')} aria-pressed={activeTab === 'stats'} className={tabButtonClass(activeTab === 'stats')}>{t('session.cacheUsage.tabs.stats', 'Stats')}</button>
        <button type="button" onClick={() => setActiveTab('recent')} aria-pressed={activeTab === 'recent'} className={tabButtonClass(activeTab === 'recent')}>{t('session.cacheUsage.tabs.recent', 'Recent')}</button>
      </nav>

      {refreshing || (error && stats) ? (
        <div className={`flex min-h-8 shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5 text-xs ${error ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-border/70 bg-primary/5 text-muted-foreground'}`} role="status">
          <span>{error ? t('session.cacheUsage.refreshFailed', 'Refresh failed: {{message}}', { message: error }) : t('session.cacheUsage.refreshing', 'Refreshing cache usage...')}</span>
          {error ? <button type="button" onClick={handleRefresh} className="border border-current/30 px-2 py-1 text-[11px] hover:bg-background/40">{t('session.cacheUsage.retry', 'Retry')}</button> : null}
        </div>
      ) : null}

      <SessionPluginPanelBody className="p-0" aria-busy={pending}>
        {initialLoading ? (
          <SessionPluginPanelState className="m-3" role="status">{t('session.cacheUsage.loading', 'Loading cache usage...')}</SessionPluginPanelState>
        ) : error && !stats ? (
          <SessionPluginPanelState tone="error" className="m-3" role="alert">
            <p>{error}</p>
            <button type="button" onClick={handleRefresh} className="mt-2 border border-current/30 px-2 py-1 text-xs hover:bg-destructive/5">{t('session.cacheUsage.retry', 'Retry')}</button>
          </SessionPluginPanelState>
        ) : !stats || stats.assistantMessages === 0 ? (
          <SessionPluginPanelState className="m-3" role="status">
            <p>{t('session.cacheUsage.empty', 'No assistant usage metrics found in this session.')}</p>
            <p className="mt-2 text-xs text-muted-foreground/80">{branchHint}</p>
          </SessionPluginPanelState>
        ) : activeTab === 'overview' ? (
          <div className="space-y-4 px-3 py-4">
            <section className="border-b border-border/70 pb-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-muted-foreground">{t('session.cacheUsage.overview.signals', 'Signals')}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{formatInt(stats.insights.length, language)}</div>
              </div>
              {stats.insights.length > 0 ? (
                <div className="space-y-2">
                  {stats.insights.map((insight) => (
                    <InsightCard key={insight.id} insight={insight} locale={language} t={t} />
                  ))}
                </div>
              ) : (
                <div className="border-l-2 border-primary/70 px-3 py-2 text-sm text-muted-foreground">
                  {t('session.cacheUsage.insights.empty', 'No cache anomalies detected in this session.')}
                </div>
              )}
            </section>

            <ModelStatsTable models={stats.modelStats} locale={language} t={t} />

            <CostSummary stats={stats} locale={language} t={t} />
            <div className="text-[11px] leading-relaxed text-muted-foreground">{branchHint}</div>
          </div>
        ) : activeTab === 'trend' ? (
          <div className="space-y-4 px-3 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-muted-foreground">{t('session.cacheUsage.tabs.trend', 'Trend')}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t('session.cacheUsage.summary.assistantTurns', 'Assistant turns')}: {formatInt(stats.messages.length, language)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => setTrendView('per-turn')} aria-pressed={trendView === 'per-turn'} className={tabButtonClass(trendView === 'per-turn')}>{t('session.cacheUsage.views.perTurn', 'Per-turn %')}</button>
                <button type="button" onClick={() => setTrendView('cumulative-percent')} aria-pressed={trendView === 'cumulative-percent'} className={tabButtonClass(trendView === 'cumulative-percent')}>{t('session.cacheUsage.views.cumulativePercent', 'Cum %')}</button>
                <button type="button" onClick={() => setTrendView('cumulative-total')} aria-pressed={trendView === 'cumulative-total'} className={tabButtonClass(trendView === 'cumulative-total')}>{t('session.cacheUsage.views.cumulativeTotal', 'Cum total')}</button>
              </div>
            </div>

            <div className="border-y border-border/70 py-3">
              {trendData?.kind === 'bars' ? (
                <PercentBarChart values={trendData.values} width={width} locale={language} />
              ) : trendData?.kind === 'line' ? (
                <PercentLineChart values={trendData.values} width={width} locale={language} />
              ) : trendData?.kind === 'stacked' ? (
                <>
                  <StackedTotalsChart input={trendData.input} cacheWrite={trendData.cacheWrite} cacheRead={trendData.cacheRead} width={width} locale={language} />
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span><span className="mr-1 inline-block h-2 w-2 bg-muted" />{t('session.cacheUsage.stats.input', 'Input (uncached)')}</span>
                    <span><span className="mr-1 inline-block h-2 w-2 bg-warning" />{t('session.cacheUsage.stats.cacheWrite', 'Cache write')}</span>
                    <span><span className="mr-1 inline-block h-2 w-2 bg-primary/70" />{t('session.cacheUsage.stats.cacheRead', 'Cache hit')}</span>
                  </div>
                </>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-border/70 pb-4 text-xs sm:grid-cols-4">
              <div className="border-l-2 border-primary/70 px-2"><div className="text-muted-foreground">{t('session.cacheUsage.summary.latest', 'Latest')}</div><div className="mt-1 font-mono text-foreground">{formatPercent(latestPoint, language)}</div></div>
              <div className="border-l-2 border-border px-2"><div className="text-muted-foreground">{t('session.cacheUsage.summary.min', 'Min')}</div><div className="mt-1 font-mono text-foreground">{formatPercent(minHit, language)}</div></div>
              <div className="border-l-2 border-border px-2"><div className="text-muted-foreground">{t('session.cacheUsage.summary.max', 'Max')}</div><div className="mt-1 font-mono text-foreground">{formatPercent(maxHit, language)}</div></div>
              <div className="border-l-2 border-border px-2"><div className="text-muted-foreground">{t('session.cacheUsage.summary.turns', 'Turns')}</div><div className="mt-1 font-mono text-foreground">{formatInt(stats.messages.length, language)}</div></div>
            </div>

            <div className="text-[11px] leading-relaxed text-muted-foreground">{branchHint}</div>
          </div>
        ) : activeTab === 'stats' ? (
          <div className="space-y-4 px-3 py-4">
            <StatSection title={branchTitle} totals={stats.activeBranchTotals} locale={language} t={t} />
            <StatSection title={t('session.cacheUsage.stats.wholeTree', 'Whole tree')} totals={stats.treeTotals} locale={language} t={t} />
            <StatSection title={t('session.cacheUsage.stats.delta', 'Delta')} totals={deltaTotals(stats)} locale={language} t={t} delta />
            <ModelStatsTable models={stats.modelStats} locale={language} t={t} />
            <CostSummary stats={stats} locale={language} t={t} />
          </div>
        ) : (
          <div className="px-3 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-xs font-medium text-muted-foreground">{t('session.cacheUsage.recentTurns', 'Recent {{count}} turns', { count: recentMessages.length })}</div>
              <div className="font-mono text-[11px] text-muted-foreground">{formatInt(recentMessages.length, language)}</div>
            </div>
            {recentMessages.length > 0 ? (
              <div className="space-y-0">
                {recentMessages.map((message) => (
                  <div key={message.id} className="relative border-l border-border/70 py-3 pl-3 first:pt-0 last:pb-0">
                    <span className={`absolute -left-[4px] top-4 h-1.5 w-1.5 rounded-full ${message.modelChanged || message.cacheWriteSpike ? 'bg-warning' : 'bg-primary/70'}`} aria-hidden="true" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">{t('session.cacheUsage.sequence', '#{{value}}', { value: message.sequence })}</span>
                          <span className="truncate text-sm font-medium text-foreground">{providerModelLabel(message, t('session.cacheUsage.modelFallback', 'assistant'))}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{formatTimestamp(message.timestamp, language)}</div>
                        {message.reasons.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {message.reasons.map((reason) => (
                              <span key={reason} className="border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{reasonLabel(reason, t)}</span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span>{t('session.cacheUsage.stats.input', 'Input (uncached)')}: <span className="font-mono text-foreground">{formatInt(message.input, language)}</span></span>
                          <span>{t('session.cacheUsage.stats.output', 'Output')}: <span className="font-mono text-foreground">{formatInt(message.output, language)}</span></span>
                          <span>{t('session.cacheUsage.stats.cacheRead', 'Cache hit')}: <span className="font-mono text-foreground">{formatInt(message.cacheRead, language)}</span></span>
                          <span>{t('session.cacheUsage.stats.cacheWrite', 'Cache write')}: <span className="font-mono text-foreground">{formatInt(message.cacheWrite, language)}</span></span>
                          <span>{t('session.cacheUsage.insights.hitRateDelta', 'Hit delta')}: <span className="font-mono text-foreground">{formatSignedPercent(message.hitRateDelta, language)}</span></span>
                          <span>{t('session.cacheUsage.cost.recorded', 'Recorded cost')}: <span className="font-mono text-foreground">{message.costKnown ? formatCost(message.cost.total, language) : t('session.cacheUsage.cost.unknown', 'Unknown')}</span></span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-semibold text-foreground">{formatPercent(message.hitRate, language)}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{t('session.cacheUsage.stats.promptTotal', 'Prompt total')}: {formatInt(message.promptTotal, language)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-l-2 border-border px-3 py-3 text-sm text-muted-foreground">{t('session.cacheUsage.noRecentTurns', 'No recent assistant turns.')}</div>
            )}
          </div>
        )}
      </SessionPluginPanelBody>
    </SessionPluginPanel>
  )
}
