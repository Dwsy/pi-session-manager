import type { PsmAgentUsageMetric, PsmAgentUsageProvider, PsmAgentUsageState } from '@pi-session-manager/plugin-sdk'

export function stateLabel(state: PsmAgentUsageState): string {
  switch (state) {
    case 'available':
      return 'Live'
    case 'unavailable':
      return 'Unavailable'
    case 'error':
      return 'Error'
    default:
      return state
  }
}

export function formatPercent(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return `${value.toFixed(value < 10 || value > 99 ? 1 : 0)}%`
}

export function formatResetAt(value?: string | null, language = 'en-US'): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function metricTone(metric: PsmAgentUsageMetric): 'ok' | 'warn' | 'critical' | 'neutral' {
  const percent = metric.usedPercent
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return 'neutral'
  if (percent >= 90) return 'critical'
  if (percent >= 75) return 'warn'
  return 'ok'
}

export function sortProviders(providers: PsmAgentUsageProvider[]): PsmAgentUsageProvider[] {
  const rank = (state: PsmAgentUsageState) => {
    if (state === 'available') return 0
    if (state === 'error') return 1
    return 2
  }
  return [...providers].sort((a, b) => {
    const stateDiff = rank(a.state) - rank(b.state)
    if (stateDiff !== 0) return stateDiff
    const aMax = Math.max(0, ...a.metrics.map((metric) => metric.usedPercent ?? 0))
    const bMax = Math.max(0, ...b.metrics.map((metric) => metric.usedPercent ?? 0))
    if (bMax !== aMax) return bMax - aMax
    return a.name.localeCompare(b.name)
  })
}

export function providerSummary(provider: PsmAgentUsageProvider): string {
  if (provider.state !== 'available') return provider.message || stateLabel(provider.state)
  const top = [...provider.metrics]
    .filter((metric) => typeof metric.usedPercent === 'number')
    .sort((a, b) => (b.usedPercent ?? 0) - (a.usedPercent ?? 0))[0]
  if (!top) {
    return provider.metrics[0]?.detail || provider.planName || 'Live'
  }
  return `${top.label} ${formatPercent(top.usedPercent)}`
}
