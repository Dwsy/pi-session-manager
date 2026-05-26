import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ChevronDown,
  Hammer,
  Loader2,
  PackageOpen,
  RefreshCw,
} from 'lucide-react'

import {
  buildDevPsmPlugin,
  initializePsmPluginHost,
  psmPluginHost,
  type PsmPluginStatus,
} from '@/plugins/runtime-host'

interface BuildLog {
  pluginId: string
  stdout: string
  stderr: string
}

function formatTime(value: number | null | undefined) {
  if (!value) return null
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function compactPath(path: string | null | undefined) {
  if (!path) return null
  const home = path.replace(/^\/Users\/[^/]+/, '~')
  const segments = home.split('/').filter(Boolean)
  if (segments.length <= 4) return home
  return `${home.startsWith('~') ? '~/' : '/'}${segments.slice(-3).join('/')}`
}

function stateDotClass(state: PsmPluginStatus['state']) {
  if (state === 'active') return 'bg-success'
  if (state === 'error') return 'bg-warning'
  return 'bg-muted-foreground/45'
}

export default function CommandDevPanel() {
  const { t } = useTranslation()
  const [plugins, setPlugins] = useState<PsmPluginStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [buildingId, setBuildingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buildLog, setBuildLog] = useState<BuildLog | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const devPlugins = useMemo(
    () => plugins.filter((plugin) => plugin.source === 'dev'),
    [plugins],
  )

  const summary = useMemo(() => {
    const active = devPlugins.filter((p) => p.state === 'active').length
    const errors = devPlugins.filter((p) => p.state === 'error').length
    const latest = devPlugins.reduce<number | null>((acc, p) => {
      if (!p.moduleModifiedMs) return acc
      return acc === null ? p.moduleModifiedMs : Math.max(acc, p.moduleModifiedMs)
    }, null)
    return { active, errors, latest }
  }, [devPlugins])

  const loadPlugins = async () => {
    setLoading(true)
    setError(null)
    try {
      const current = psmPluginHost.listPlugins()
      setPlugins(current.length > 0 ? current : await initializePsmPluginHost())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPlugins()
    return psmPluginHost.subscribe(() => {
      setPlugins(psmPluginHost.listPlugins())
    })
  }, [])

  const rebuildPlugin = async (plugin: PsmPluginStatus) => {
    const projectPath = plugin.projectPath ?? plugin.sourceId
    if (!projectPath) return
    setBuildingId(plugin.id)
    setError(null)
    setBuildLog(null)
    try {
      const result = await buildDevPsmPlugin(projectPath)
      setBuildLog({
        pluginId: plugin.id,
        stdout: result.stdout,
        stderr: result.stderr,
      })
      setExpandedId(plugin.id)
      setPlugins(await psmPluginHost.reload())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBuildingId(null)
    }
  }

  const renderSummaryLine = () => {
    if (devPlugins.length === 0) {
      return t('command.dev.summaryEmpty', 'No dev plugins loaded')
    }
    const parts: string[] = []
    parts.push(t('command.dev.summaryCount', '{{count}} dev plugins', { count: devPlugins.length }))
    if (summary.active > 0) parts.push(t('command.dev.summaryActive', '{{count}} active', { count: summary.active }))
    if (summary.errors > 0) parts.push(t('command.dev.summaryErrors', '{{count}} with errors', { count: summary.errors }))
    if (summary.latest) parts.push(t('command.dev.summaryBuilt', 'built {{time}}', { time: formatTime(summary.latest) }))
    return parts.join(' · ')
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5">
        <div className="min-w-0 text-[12px] text-muted-foreground">
          {renderSummaryLine()}
        </div>
        <button
          onClick={() => void loadPlugins()}
          disabled={loading || buildingId !== null}
          title={t('command.dev.refresh', 'Refresh')}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 text-muted-foreground motion-color hover:text-foreground hover:border-borderAccent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-3 mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {loading && devPlugins.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t('command.dev.loading', 'Loading dev plugins...')}
          </div>
        ) : devPlugins.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <PackageOpen className="mb-2 h-5 w-5 text-muted-foreground/60" />
            <div className="text-[12px] text-muted-foreground">
              {t('command.dev.empty', 'No dev plugins')}
            </div>
            <div className="mt-1 max-w-[320px] text-[11px] text-muted-foreground/75">
              {t('command.dev.emptyHint', 'Add a dev project from Settings > Plugins > Developer.')}
            </div>
          </div>
        ) : (
          <ul className="py-1">
            {devPlugins.map((plugin) => {
              const isExpanded = expandedId === plugin.id
              const isBuilding = buildingId === plugin.id
              const builtAt = formatTime(plugin.moduleModifiedMs)
              const projectPath = compactPath(plugin.projectPath ?? plugin.sourceId)
              const hasDiagnostics = plugin.diagnostics.length > 0
              const hasLog =
                buildLog?.pluginId === plugin.id && Boolean(buildLog.stdout || buildLog.stderr)
              const canExpand = hasDiagnostics || hasLog

              return (
                <li key={plugin.id}>
                  <button
                    type="button"
                    onClick={() => canExpand && setExpandedId(isExpanded ? null : plugin.id)}
                    className={[
                      'group flex w-full items-start gap-3 px-4 py-2 text-left motion-color',
                      canExpand ? '' : 'cursor-default',
                      isExpanded ? 'bg-foreground/[0.04]' : 'hover:bg-foreground/[0.03]',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${stateDotClass(plugin.state)}`}
                      title={plugin.state}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate text-[13px] font-medium text-foreground">
                          {plugin.name}
                        </span>
                        {plugin.version && (
                          <span className="font-mono text-[11px] text-muted-foreground/70">
                            v{plugin.version}
                          </span>
                        )}
                        {plugin.state === 'error' && (
                          <span className="text-[11px] text-warning">
                            {t('command.dev.statError', 'error')}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {projectPath && (
                          <span className="font-mono" title={plugin.projectPath ?? undefined}>
                            {projectPath}
                          </span>
                        )}
                        <span>
                          {t('command.dev.counts', '{{cmd}} cmd · {{tool}} tool', {
                            cmd: plugin.commands.length,
                            tool: plugin.tools.length,
                          })}
                        </span>
                        {builtAt && (
                          <span>
                            {t('command.dev.builtAt', 'built {{time}}', { time: builtAt })}
                          </span>
                        )}
                        {plugin.loadTimeMs !== undefined && (
                          <span>{plugin.loadTimeMs}ms</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <span
                        onClick={(event) => {
                          event.stopPropagation()
                          void rebuildPlugin(plugin)
                        }}
                        role="button"
                        aria-disabled={isBuilding || buildingId !== null}
                        className={[
                          'inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] font-medium text-foreground/85 motion-color',
                          'hover:border-borderAccent hover:bg-surface/40',
                          isBuilding || buildingId !== null ? 'pointer-events-none opacity-50' : '',
                        ].join(' ')}
                      >
                        {isBuilding ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Hammer className="h-3 w-3" />
                        )}
                        <span>{t('command.dev.build', 'Build')}</span>
                      </span>
                      {canExpand && (
                        <ChevronDown
                          className={`h-3.5 w-3.5 text-muted-foreground/70 motion-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      )}
                    </div>
                  </button>

                  {isExpanded && canExpand && (
                    <div className="border-t border-border/40 bg-surface/20 px-4 py-2 text-[11px]">
                      {hasDiagnostics && (
                        <div className="mb-2 space-y-1">
                          {plugin.diagnostics.map((diagnostic, index) => (
                            <div
                              key={`${plugin.id}-diagnostic-${index}`}
                              className="flex items-start gap-1.5 text-warning"
                            >
                              <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                              <span>{diagnostic.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {hasLog && buildLog && (
                        <div className="space-y-1.5">
                          {buildLog.stdout && (
                            <pre className="max-h-32 overflow-auto rounded-md bg-surface-dark/55 p-2 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap">
                              {buildLog.stdout}
                            </pre>
                          )}
                          {buildLog.stderr && (
                            <pre className="max-h-32 overflow-auto rounded-md border border-destructive/25 bg-destructive/10 p-2 font-mono text-[11px] text-destructive whitespace-pre-wrap">
                              {buildLog.stderr}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
