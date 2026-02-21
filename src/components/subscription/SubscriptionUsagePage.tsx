import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCcw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { invoke } from '../../transport'

interface SubscriptionUsageWindow {
  label: string
  used_percent?: number | null
  reset_at?: string | null
  reset_description?: string | null
}

interface SubscriptionUsageEntry {
  provider: string
  fetched_at?: number | null
  status_description?: string | null
  windows: SubscriptionUsageWindow[]
  error_message?: string | null
}

interface SubscriptionUsageSnapshot {
  source_path: string
  available: boolean
  entries: SubscriptionUsageEntry[]
  message?: string | null
}

function formatTime(ts?: number | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

function formatPercent(v?: number | null): string {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—'
  return `${Math.max(0, Math.min(100, v)).toFixed(0)}%`
}

function ProgressBar({ percent, colorClass = "bg-blue-500" }: { percent: number; colorClass?: string }) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div className="h-2 bg-secondary rounded-full overflow-hidden mt-1">
      <div 
        className={`h-full ${colorClass} transition-all duration-300`} 
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export default function SubscriptionUsagePage() {
  const [data, setData] = useState<SubscriptionUsageSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await invoke<SubscriptionUsageSnapshot>('get_subscription_usage')
      setData(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const summary = useMemo(() => {
    if (!data) return { providers: 0, windows: 0 }
    return {
      providers: data.entries.length,
      windows: data.entries.reduce((acc, e) => acc + e.windows.length, 0),
    }
  }, [data])

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Subscription & Usage</h2>
          <p className="text-sm text-muted-foreground">
            来源：@marckrenn/pi-sub-core 缓存
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent disabled:opacity-60"
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!error && data?.message && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{data.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Providers</div>
          <div className="text-2xl font-semibold mt-1">{summary.providers}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Windows</div>
          <div className="text-2xl font-semibold mt-1">{summary.windows}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">Data Ready</div>
          <div className="text-sm font-medium mt-2 inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            {data?.available ? 'Yes' : 'No'}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {data?.entries.map((entry) => (
          <div key={entry.provider} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold capitalize">{entry.provider}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  更新时间：{formatTime(entry.fetched_at)}
                </div>
                {entry.status_description && (
                  <div className="text-xs text-muted-foreground mt-1">状态：{entry.status_description}</div>
                )}
                {entry.error_message && (
                  <div className="text-xs text-red-300 mt-1">错误：{entry.error_message}</div>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {entry.windows.length === 0 ? (
                <div className="text-xs text-muted-foreground">暂无窗口数据</div>
              ) : (
                entry.windows.map((w, idx) => {
                  const usedPercent = typeof w.used_percent === 'number' ? w.used_percent : 0
                  const leftPercent = 100 - usedPercent
                  // Color based on remaining (green = plenty left, red = running low)
                  const colorClass = leftPercent < 10 ? "bg-red-500" : leftPercent < 30 ? "bg-yellow-500" : "bg-green-500"
                  return (
                    <div key={`${entry.provider}-${idx}`} className="rounded-md border border-border/70 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">{w.label}</div>
                        <div className="text-xs font-mono text-muted-foreground">
                          {formatPercent(leftPercent)} left
                        </div>
                      </div>
                      {/* Progress bar shows remaining (like pi native UI) */}
                      <ProgressBar percent={leftPercent} colorClass={colorClass} />
                      <div className="text-xs text-muted-foreground mt-1">
                        Used {formatPercent(usedPercent)} · Resets: {w.reset_description || '—'}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {data && (
        <div className="text-xs text-muted-foreground break-all border-t border-border pt-3">
          cache: {data.source_path}
        </div>
      )}
    </div>
  )
}
