import { Coins, Cpu, Database, DollarSign } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import DashboardCardShell from './DashboardCardShell'
import type { SessionStats } from '@/types'
import { formatTokens } from '@/utils/format'

interface TopModelsChartProps {
  stats: SessionStats
  title?: string
  limit?: number
  onModelClick?: (model: string) => void
}

const compact = formatTokens

function money(value: number): string {
  if (value === 0) return '$0.00'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(value < 1 ? 3 : 2)}`
}

export default function TopModelsChart({ stats, title, limit = 8, onModelClick }: TopModelsChartProps) {
  const { t } = useTranslation()
  const displayTitle = title || t('dashboard.topModels.tokenUsageTitle', 'Model token usage')
  const allModels = Object.entries(stats.token_details.tokens_by_model)
    .map(([name, usage]) => {
      const cache = usage.cache_read + usage.cache_write
      const tokens = usage.input + usage.output + cache
      return { name, usage, cache, tokens, sessions: stats.sessions_by_model[name] || 0 }
    })
    .filter((item) => item.tokens > 0 || item.usage.cost > 0)
    .sort((left, right) => right.tokens - left.tokens || right.usage.cost - left.usage.cost || left.name.localeCompare(right.name))
  const totalMeasured = allModels.reduce((sum, item) => sum + item.tokens, 0)
  const models = allModels.slice(0, limit)

  return (
    <DashboardCardShell className="p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-purple/10 text-purple"><Cpu className="h-3 w-3" aria-hidden="true" /></span>
            <span className="truncate">{displayTitle}</span>
          </h3>
          <p className="mt-1 text-[9px] text-muted-foreground">{t('dashboard.topModels.tokenUsageHint', 'Ranked by input, output, and cache tokens')}</p>
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{compact(stats.total_tokens)} T</span>
      </div>

      {models.length ? (
        <div className="space-y-1.5">
          {models.map((item, index) => {
            const share = totalMeasured > 0 ? item.tokens / totalMeasured : 0
            const cacheShare = item.tokens > 0 ? item.cache / item.tokens : 0
            return (
              <button
                type="button"
                key={item.name}
                onClick={() => onModelClick?.(item.name)}
                disabled={!onModelClick}
                className={`w-full rounded border border-border/55 bg-background/40 p-2 text-left ${onModelClick ? 'focus-ring hover:border-border hover:bg-muted/25' : 'cursor-default'}`}
                title={item.name}
              >
                <div className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-purple/10 text-[9px] font-semibold tabular-nums text-purple">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">{item.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Coins className="h-2.5 w-2.5" aria-hidden="true" />{compact(item.tokens)} · {Math.round(share * 100)}%</span>
                      <span>{item.sessions} {t('dashboard.topModels.sessionsShort', 'sessions')}</span>
                      <span className="inline-flex items-center gap-1"><DollarSign className="h-2.5 w-2.5" aria-hidden="true" />{money(item.usage.cost)}</span>
                      <span className="inline-flex items-center gap-1"><Database className="h-2.5 w-2.5" aria-hidden="true" />{Math.round(cacheShare * 100)}% {t('dashboard.topModels.cacheShort', 'cache')}</span>
                    </span>
                  </span>
                  <strong className="shrink-0 text-sm tabular-nums text-foreground">{compact(item.tokens)}</strong>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-muted-foreground">{t('dashboard.topModels.noTokenUsage', 'No measured model token usage')}</div>
      )}
    </DashboardCardShell>
  )
}
