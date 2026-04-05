import { useEffect, useMemo } from 'react'
import {
  X,
  Coins,
  DollarSign,
  WalletCards,
  FolderGit2,
  Sparkles,
  ChevronsDown,
} from 'lucide-react'
import type { SessionStats } from '@/types'
import { getPathBasename } from '@/utils/path'

interface DashboardInsightModalProps {
  open: boolean
  mode: 'token_cost' | 'model_projects'
  stats: SessionStats
  selectedModel?: string | null
  onClose: () => void
}

type UsageRow = {
  provider: string
  model: string
  fullModel: string
  sessions: number
  messages: number
  cost: number
  input: number
  output: number
  cache: number
  tokens: number
}

type ProviderGroup = {
  provider: string
  sessions: number
  messages: number
  cost: number
  input: number
  output: number
  cache: number
  tokens: number
  models: UsageRow[]
}

function formatTokens(count: number): string {
  if (count === 0) return '-'
  if (count < 1_000) return count.toString()
  if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  return `${Math.round(count / 1_000_000)}M`
}

function formatNumber(n: number): string {
  if (n === 0) return '-'
  return n.toLocaleString()
}

function formatCost(cost: number): string {
  if (cost === 0) return '-'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  if (cost < 1) return `$${cost.toFixed(3)}`
  if (cost < 10) return `$${cost.toFixed(2)}`
  if (cost < 100) return `$${cost.toFixed(1)}`
  return `$${Math.round(cost)}`
}

function formatModelName(name: string): string {
  return name
    .replace(/^anthropic\//, '')
    .replace(/^openai\//, '')
    .replace(/^google\//, '')
    .replace(/-latest$/, '')
}

export default function DashboardInsightModal({
  open,
  mode,
  stats,
  selectedModel,
  onClose,
}: DashboardInsightModalProps) {
  const totalCostIncSubagents = stats.token_details.total_cost + (stats.subagent_summary?.total_cost ?? 0)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const providerGroups = useMemo<ProviderGroup[]>(() => {
    const groupMap = new Map<string, ProviderGroup>()

    for (const [fullModel, usage] of Object.entries(stats.token_details.tokens_by_model)) {
      const provider = fullModel.includes('/') ? fullModel.split('/')[0] : fullModel
      const model = fullModel.includes('/') ? fullModel.split('/').slice(1).join('/') : fullModel
      const row: UsageRow = {
        provider,
        model,
        fullModel,
        sessions: stats.sessions_by_model[fullModel] ?? 0,
        messages: usage.messages,
        cost: usage.cost,
        input: usage.input,
        output: usage.output,
        cache: usage.cache_read + usage.cache_write,
        tokens: usage.input + usage.output,
      }

      const current = groupMap.get(provider) ?? {
        provider,
        sessions: 0,
        messages: 0,
        cost: 0,
        input: 0,
        output: 0,
        cache: 0,
        tokens: 0,
        models: [],
      }

      current.sessions += row.sessions
      current.messages += row.messages
      current.cost += row.cost
      current.input += row.input
      current.output += row.output
      current.cache += row.cache
      current.tokens += row.tokens
      current.models.push(row)

      groupMap.set(provider, current)
    }

    return Array.from(groupMap.values())
      .map((group) => ({
        ...group,
        models: group.models.sort((a, b) => {
          if (b.cost !== a.cost) return b.cost - a.cost
          if (b.tokens !== a.tokens) return b.tokens - a.tokens
          return a.fullModel.localeCompare(b.fullModel)
        }),
      }))
      .sort((a, b) => {
        if (b.cost !== a.cost) return b.cost - a.cost
        if (b.tokens !== a.tokens) return b.tokens - a.tokens
        return a.provider.localeCompare(b.provider)
      })
  }, [stats.token_details.tokens_by_model, stats.sessions_by_model])

  const usageTotals = useMemo(() => {
    return providerGroups.reduce(
      (acc, group) => {
        acc.sessions += group.sessions
        acc.messages += group.messages
        acc.cost += group.cost
        acc.input += group.input
        acc.output += group.output
        acc.cache += group.cache
        acc.tokens += group.tokens
        return acc
      },
      { sessions: 0, messages: 0, cost: 0, input: 0, output: 0, cache: 0, tokens: 0 },
    )
  }, [providerGroups])

  const modelProjects = useMemo(() => {
    if (!selectedModel) return []
    return Object.entries(stats.model_usage_by_project?.[selectedModel] ?? {})
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]
        return a[0].localeCompare(b[0])
      })
  }, [selectedModel, stats.model_usage_by_project])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 ui-enter-fade"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-background/72 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-6xl rounded-2xl border border-border/25 bg-background/95 shadow-[0_20px_50px_rgba(0,0,0,0.35)] ui-enter-zoom overflow-hidden">
        <div className="px-5 py-4 border-b border-border/20 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-warning" />
              Dashboard Insight
            </div>
            {mode === 'token_cost' ? (
              <h3 className="text-lg font-semibold text-foreground">Token Usage & Cost Breakdown</h3>
            ) : (
              <h3 className="text-lg font-semibold text-foreground truncate">
                Model Usage by Project · {selectedModel ? formatModelName(selectedModel) : 'Unknown'}
              </h3>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-border/20 bg-muted/15 p-2 text-muted-foreground hover:text-foreground hover:bg-muted/30 motion-surface motion-color motion-press focus-ring"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          {mode === 'token_cost' ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <MetricCard icon={Coins} label="Billable Tokens" value={formatTokens(stats.total_tokens)} tone="text-info" />
                <MetricCard icon={DollarSign} label="Total Cost" value={formatCost(totalCostIncSubagents)} tone="text-destructive" />
                <MetricCard icon={WalletCards} label="Providers / Models" value={`${formatNumber(providerGroups.length)} / ${formatNumber(Object.keys(stats.token_details.tokens_by_model).length)}`} tone="text-warning" />
              </div>


              <section className="rounded-xl border border-border/20 bg-background/35 overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-border/20 bg-muted/20 text-[11px] text-muted-foreground">
                  Provider grouped usage table · fixed-height scroll area, total pinned at bottom
                </div>

                <div className="max-h-[46vh] overflow-y-auto">
                  <table className="w-full min-w-[860px] text-xs">
                    <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/20">
                      <tr className="text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium">Provider / Model</th>
                        <th className="px-2 py-2 text-right font-medium">Sessions</th>
                        <th className="px-2 py-2 text-right font-medium">Msgs</th>
                        <th className="px-2 py-2 text-right font-medium">Cost</th>
                        <th className="px-2 py-2 text-right font-medium">Tokens</th>
                        <th className="px-2 py-2 text-right font-medium">↑In</th>
                        <th className="px-2 py-2 text-right font-medium">↓Out</th>
                        <th className="px-3 py-2 text-right font-medium">Cache</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providerGroups.map((group) => (
                        <FragmentGroup key={group.provider} group={group} />
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-border/20 bg-background/90">
                  <table className="w-full min-w-[860px] text-xs">
                    <tbody>
                      <tr className="font-semibold text-foreground">
                        <td className="px-3 py-2.5 text-left">Total</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(usageTotals.sessions)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(usageTotals.messages)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{formatCost(usageTotals.cost)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{formatTokens(usageTotals.tokens)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{formatTokens(usageTotals.input)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{formatTokens(usageTotals.output)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatTokens(usageTotals.cache)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-border/20 bg-muted/15 p-3.5 text-xs text-muted-foreground">
                Shows which projects used this model, sorted by number of sessions using that model.
              </div>

              {modelProjects.length > 0 ? (
                <div className="space-y-2 max-h-[56vh] overflow-y-auto pr-1">
                  {modelProjects.map(([projectPath, count]) => {
                    const max = modelProjects[0]?.[1] ?? 1
                    const percent = max > 0 ? (count / max) * 100 : 0
                    const projectName = getPathBasename(projectPath)
                    return (
                      <div
                        key={`${selectedModel}-${projectPath}`}
                        className="rounded-xl border border-border/20 bg-background/40 p-3"
                      >
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <div className="min-w-0 flex items-center gap-2">
                            <FolderGit2 className="w-3.5 h-3.5 text-info shrink-0" />
                            <span className="text-sm text-foreground truncate">{projectName}</span>
                          </div>
                          <span className="text-xs text-muted-foreground tabular-nums">{count} sessions</span>
                        </div>
                        <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-info to-[#7db7ff] rounded-full"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1 truncate">{projectPath}</div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-border/20 bg-muted/15 p-4 text-sm text-muted-foreground text-center">
                  No project-level usage found for this model.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function FragmentGroup({ group }: { group: ProviderGroup }) {
  return (
    <>
      <tr className="bg-muted/20 text-foreground border-b border-border/10">
        <td className="px-3 py-2 font-medium">
          <span className="inline-flex items-center gap-1.5">
            <ChevronsDown className="w-3.5 h-3.5 text-muted-foreground" />
            {group.provider}
          </span>
        </td>
        <td className="px-2 py-2 text-right tabular-nums">{formatNumber(group.sessions)}</td>
        <td className="px-2 py-2 text-right tabular-nums">{formatNumber(group.messages)}</td>
        <td className="px-2 py-2 text-right tabular-nums">{formatCost(group.cost)}</td>
        <td className="px-2 py-2 text-right tabular-nums">{formatTokens(group.tokens)}</td>
        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{formatTokens(group.input)}</td>
        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{formatTokens(group.output)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatTokens(group.cache)}</td>
      </tr>

      {group.models.map((row) => (
        <tr key={`${row.provider}-${row.fullModel}`} className="border-b border-border/10 last:border-b-0">
          <td className="px-3 py-2 text-muted-foreground max-w-[320px] truncate" title={row.fullModel}>
            <span className="pl-5">{formatModelName(row.model)}</span>
          </td>
          <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">{formatNumber(row.sessions)}</td>
          <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">{formatNumber(row.messages)}</td>
          <td className="px-2 py-2 text-right text-foreground tabular-nums">{formatCost(row.cost)}</td>
          <td className="px-2 py-2 text-right text-foreground tabular-nums">{formatTokens(row.tokens)}</td>
          <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">{formatTokens(row.input)}</td>
          <td className="px-2 py-2 text-right text-muted-foreground tabular-nums">{formatTokens(row.output)}</td>
          <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{formatTokens(row.cache)}</td>
        </tr>
      ))}
    </>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  tone: string
}) {
  return (
    <div className="rounded-xl border border-border/20 bg-background/50 p-3.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className={`w-3.5 h-3.5 ${tone}`} />
        {label}
      </div>
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  )
}
