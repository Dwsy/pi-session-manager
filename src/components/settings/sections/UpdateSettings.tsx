import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { check, Update } from '@tauri-apps/plugin-updater'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import SettingsCard from '@/components/settings/SettingsCard'
import SettingsToggleRow from '@/components/settings/SettingsToggleRow'
import type { UpdateSettingsProps } from '@/components/settings/types'
import { getLastUpdateCheckAt } from '@/utils/updateChecker'

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'latest'; currentVersion: string }
  | { phase: 'available'; update: Update; currentVersion: string; latestVersion: string }
  | { phase: 'downloading'; update: Update; progress: number; downloaded: number; total: number | null }
  | { phase: 'ready'; update: Update }
  | { phase: 'error'; message: string }

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

export default function UpdateSettings({ settings, onUpdate }: UpdateSettingsProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })
  const [lastCheckedAt] = useState<string | null>(() => getLastUpdateCheckAt())

  const lastCheckedLabel = useMemo(() => {
    return formatDateTime(lastCheckedAt) || t('settings.update.neverChecked', 'Not checked yet')
  }, [lastCheckedAt, t])

  const handleCheck = async () => {
    setState({ phase: 'checking' })
    try {
      const update = await check()
      if (update) {
        setState({
          phase: 'available',
          update,
          currentVersion: update.currentVersion,
          latestVersion: update.version,
        })
      } else {
        setState({ phase: 'latest', currentVersion: '0.0.0' })
      }
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const handleDownload = async () => {
    const currentState = state
    if (currentState.phase !== 'available') return

    const { update } = currentState
    setState({ phase: 'downloading', update, progress: 0, downloaded: 0, total: null })

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          setState({
            phase: 'downloading',
            update,
            progress: 0,
            downloaded: 0,
            total: event.data.contentLength ?? null,
          })
        } else if (event.event === 'Progress') {
          setState((prev) => {
            if (prev.phase !== 'downloading') return prev
            const downloaded = prev.downloaded + event.data.chunkLength
            const total = prev.total
            const progress = total ? (downloaded / total) * 100 : 0
            return { ...prev, downloaded, progress }
          })
        } else if (event.event === 'Finished') {
          setState({ phase: 'ready', update })
        }
      })
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Download failed',
      })
    }
  }

  const handleInstall = async () => {
    const currentState = state
    if (currentState.phase !== 'ready') return
    try {
      await currentState.update.install()
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Install failed',
      })
    }
  }

  const handleReset = () => {
    setState({ phase: 'idle' })
  }

  const renderContent = () => {
    switch (state.phase) {
      case 'idle':
        return (
          <>
            <div className="pt-3 border-t border-border/60 space-y-3">
              <button
                onClick={handleCheck}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-info hover:bg-info/90 text-white text-sm font-medium motion-color motion-press focus-ring"
              >
                <RefreshCw className="h-4 w-4" />
                {t('settings.update.checkNow', 'Check for updates now')}
              </button>
              <p className="text-xs text-muted-foreground">
                {t('settings.update.lastCheckedAt', 'Last checked at')}: {lastCheckedLabel}
              </p>
            </div>
          </>
        )

      case 'checking':
        return (
          <div className="pt-3 border-t border-border/60 flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('settings.update.checking', 'Checking...')}
          </div>
        )

      case 'latest':
        return (
          <div className="pt-3 border-t border-border/60 space-y-3">
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-300 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p>{t('settings.update.result.upToDate', 'Already at latest version')}</p>
                <p className="text-green-400/70 mt-1">v{state.currentVersion}</p>
              </div>
            </div>
            <button
              onClick={handleCheck}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted motion-color motion-press focus-ring"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('settings.update.checkAgain', 'Check again')}
            </button>
          </div>
        )

      case 'available': {
        const { currentVersion, latestVersion } = state
        return (
          <div className="pt-3 border-t border-border/60 space-y-3">
            <div className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs text-info space-y-2">
              <div className="flex items-start gap-2">
                <Download className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    {t('settings.update.result.hasUpdate', 'New version available')}
                  </p>
                  <p className="text-info/80 mt-1">
                    v{currentVersion} → <span className="font-semibold">v{latestVersion}</span>
                  </p>
                  {state.update.body && (
                    <p className="text-info/70 mt-2 line-clamp-3 whitespace-pre-wrap">
                      {state.update.body}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-info hover:bg-info/90 text-white text-sm font-medium motion-color motion-press focus-ring"
            >
              <Download className="h-4 w-4" />
              {t('settings.update.downloadAndInstall', 'Download & Install')}
            </button>
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted motion-color motion-press focus-ring"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('settings.update.later', 'Later')}
            </button>
          </div>
        )
      }

      case 'downloading': {
        const { progress, downloaded, total } = state
        return (
          <div className="pt-3 border-t border-border/60 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t('settings.update.downloading', 'Downloading...')}</span>
                <span className="text-foreground font-mono">
                  {formatBytes(downloaded)}
                  {total ? ` / ${formatBytes(total)}` : ''}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-info transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {progress.toFixed(1)}%
              </p>
            </div>
          </div>
        )
      }

      case 'ready':
        return (
          <div className="pt-3 border-t border-border/60 space-y-3">
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs text-green-300 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p>{t('settings.update.ready', 'Update ready to install')}</p>
                <p className="text-green-400/70 mt-1">v{state.update.version}</p>
              </div>
            </div>
            <button
              onClick={handleInstall}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium motion-color motion-press focus-ring"
            >
              <Download className="h-4 w-4" />
              {t('settings.update.installAndRestart', 'Install & Restart')}
            </button>
          </div>
        )

      case 'error':
        return (
          <div className="pt-3 border-t border-border/60 space-y-3">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">{t('settings.update.error', 'Update failed')}</p>
                <p className="text-red-400/70 mt-1">{state.message}</p>
              </div>
            </div>
            <button
              onClick={handleCheck}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted motion-color motion-press focus-ring"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('settings.update.retry', 'Retry')}
            </button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        title={t('settings.update.title', 'Update')}
        description={t(
          'settings.update.description',
          'Check for new versions via GitHub Releases',
        )}
        icon={<Download className="h-4 w-4" />}
      >
        <div className="space-y-4">
          <SettingsToggleRow
            title={t('settings.update.autoCheck', 'Auto check for updates')}
            description={t(
              'settings.update.autoCheckHelp',
              'Auto-check once per day by default',
            )}
            checked={settings.update.autoCheck !== false}
            onChange={(checked) => onUpdate('update', 'autoCheck', checked)}
          />
          {renderContent()}
        </div>
      </SettingsCard>
    </div>
  )
}
