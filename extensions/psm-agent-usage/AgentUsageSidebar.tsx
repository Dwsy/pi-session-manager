import { useEffect, useMemo, useState } from 'react'
import type {
  PsmAgentUsageClient,
  PsmAgentUsageProvider,
  PsmAgentUsageStatus,
  PsmJsonConfigClient,
  PsmPluginI18nClient,
} from '@pi-session-manager/plugin-sdk'
import { RefreshCw } from 'lucide-react'

import {
  formatPercent,
  formatResetAt,
  providerSummary,
  sortProviders,
  stateLabel,
} from './format'
import { ProviderIcon } from './providerIcons'
import {
  readAgentUsageStatusCache,
  writeAgentUsageStatusCache,
} from './statusCache'

interface AgentUsageSidebarProps {
  client: PsmAgentUsageClient
  config: PsmJsonConfigClient
  i18n: PsmPluginI18nClient
  includeUnavailable: boolean
  active: boolean
}

function stateDotClass(state: PsmAgentUsageProvider['state']) {
  if (state === 'available') return 'bg-success'
  if (state === 'error') return 'bg-destructive'
  return 'bg-muted-foreground/50'
}

export default function AgentUsageSidebar({
  client,
  config,
  i18n,
  includeUnavailable,
  active,
}: AgentUsageSidebarProps) {
  const { t, language } = i18n
  const [status, setStatus] = useState<PsmAgentUsageStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await client.getStatus()
      setStatus(next)
      await writeAgentUsageStatusCache(config, next)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!active) return
    let cancelled = false
    void (async () => {
      const cached = await readAgentUsageStatusCache(config)
      if (cancelled) return
      if (cached) setStatus(cached)
      await refresh()
    })()
    return () => {
      cancelled = true
    }
    // Only auto-refresh when the app view becomes active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, client, config])

  const providers = useMemo(() => {
    const list = status?.providers ?? []
    const filtered = includeUnavailable
      ? list
      : list.filter((provider) => provider.state === 'available')
    return sortProviders(filtered)
  }, [includeUnavailable, status?.providers])

  useEffect(() => {
    if (providers.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !providers.some((provider) => provider.id === selectedId)) {
      setSelectedId(providers[0]?.id ?? null)
    }
  }, [providers, selectedId])

  const selected = providers.find((provider) => provider.id === selectedId) ?? null
  const availableCount = providers.filter((provider) => provider.state === 'available').length

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border/70 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">
              {t('plugins.agentUsage.title', 'Agent Usage')}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {availableCount}/{providers.length || 0} live
              {status?.fetchedAt
                ? ` · ${formatResetAt(status.fetchedAt, language)}`
                : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground disabled:opacity-60"
            title={t('plugins.agentUsage.refresh', 'Refresh')}
            aria-label={t('plugins.agentUsage.refresh', 'Refresh')}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {error && (
          <div className="m-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
            <div>{error}</div>
            <div className="mt-1 text-[11px] text-destructive/80">
              {t(
                'plugins.agentUsage.grantHint',
                'Enable this plugin and grant the Agent usage permission in Settings → PSM Plugins.',
              )}
            </div>
          </div>
        )}

        {!status && !error && (
          <div className="m-2 rounded-md border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
            {loading
              ? t('plugins.agentUsage.refreshing', 'Refreshing…')
              : t('plugins.agentUsage.empty', 'No usage data yet. Click Refresh after granting usage:read.')}
          </div>
        )}

        {status && providers.length === 0 && (
          <div className="m-2 rounded-md border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
            {t('plugins.agentUsage.empty', 'No usage data yet. Click Refresh after granting usage:read.')}
          </div>
        )}

        <div className="space-y-0.5 p-1.5">
          {providers.map((provider) => {
            const activeItem = provider.id === selectedId
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => setSelectedId(provider.id)}
                className={`grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left motion-color focus-ring ${
                  activeItem
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-surface/70 hover:text-foreground'
                }`}
              >
                <ProviderIcon id={provider.id} className="h-4 w-4" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium text-foreground">{provider.name}</span>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stateDotClass(provider.state)}`} />
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {provider.planName || providerSummary(provider)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {provider.state === 'available'
                    ? formatPercent(
                      Math.max(0, ...provider.metrics.map((metric) => metric.usedPercent ?? 0)),
                    )
                    : stateLabel(provider.state)}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {selected && (
        <div className="border-t border-border/70 bg-surface/20 p-2.5">
          <div className="mb-2 flex items-center gap-2">
            <ProviderIcon id={selected.id} className="h-4 w-4" />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-foreground">{selected.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {selected.planName || stateLabel(selected.state)}
              </div>
            </div>
          </div>

          {selected.state !== 'available' ? (
            <div className="rounded border border-border/60 bg-background/60 px-2 py-1.5 text-[11px] text-muted-foreground">
              {selected.message || stateLabel(selected.state)}
            </div>
          ) : (
            <div className="space-y-1.5">
              {selected.metrics.map((metric) => (
                <div
                  key={`${selected.id}-${metric.label}`}
                  className="rounded border border-border/50 bg-background/50 px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-foreground">{metric.label}</span>
                    <span className="font-mono text-muted-foreground">
                      {metric.detail || formatPercent(metric.usedPercent)}
                    </span>
                  </div>
                  {typeof metric.usedPercent === 'number' && (
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(2, Math.min(100, metric.usedPercent))}%` }}
                      />
                    </div>
                  )}
                  {metric.resetAt && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      reset {formatResetAt(metric.resetAt, language)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
