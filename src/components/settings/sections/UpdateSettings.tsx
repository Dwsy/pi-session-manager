import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/transport'
import {
  checkAppUpdate,
  downloadAndInstallAppUpdate,
  getFallbackCurrentVersion,
  type AppUpdateDownloadState,
} from '@/utils/appUpdater'
import {
  getLastUpdateCheckAt,
  setLastUpdateCheckAt,
  type AvailableUpdateInfo,
} from '@/utils/updateChecker'
import { getReleasesPageUrl, normalizeUpdateChannel } from '@/utils/updateChannel'
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Zap,
} from 'lucide-react'
import SettingsCard from '@/components/settings/SettingsCard'
import SettingsOptionGroup from '@/components/settings/SettingsOptionGroup'
import SettingsToggleRow from '@/components/settings/SettingsToggleRow'
import type { UpdateSettingsProps } from '@/components/settings/types'

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'latest'; currentVersion: string }
  | { phase: 'available'; update: AvailableUpdateInfo; currentVersion: string; latestVersion: string }
  | { phase: 'downloading'; update: AvailableUpdateInfo; progress: number; downloaded: number; total: number | null }
  | { phase: 'ready'; update: AvailableUpdateInfo }
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

function VersionBadge({ version, label }: { version: string; label?: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="px-2.5 py-1 rounded-md bg-info/10 border border-info/20 text-info font-mono text-sm">
        v{version}
      </span>
      {label && (
        <span className="px-2 py-0.5 rounded border border-success/20 bg-success/10 text-success text-xs font-medium">
          {label}
        </span>
      )}
    </div>
  )
}

function ReleaseNotesPreview({ body }: { body: string }) {
  const lines = body.split('\n').filter(Boolean).slice(0, 6)
  const hasMore = body.split('\n').filter(Boolean).length > 6

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1 max-h-32 overflow-y-auto text-xs">
      {lines.map((line, i) => {
        if (line.startsWith('###') || line.startsWith('##')) {
          return (
            <p key={i} className="font-semibold text-foreground mt-2 first:mt-0">
              {line.replace(/^#+\s*/, '')}
            </p>
          )
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <p key={i} className="text-muted-foreground pl-1">
              • {line.replace(/^[-*]\s*/, '')}
            </p>
          )
        }
        return (
          <p key={i} className="text-muted-foreground">
            {line}
          </p>
        )
      })}
      {hasMore && (
        <p className="text-muted-foreground italic pt-1">...</p>
      )}
    </div>
  )
}

export default function UpdateSettings({ settings, onUpdate }: UpdateSettingsProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<UpdateState>({ phase: 'idle' })
  const channel = normalizeUpdateChannel(settings.update.channel)
  const desktopRuntime = isTauri()
  const [lastCheckedAt, setLastCheckedAtState] = useState<string | null>(() => getLastUpdateCheckAt(channel))

  useEffect(() => {
    setLastCheckedAtState(getLastUpdateCheckAt(channel))
  }, [channel])

  const lastCheckedLabel = useMemo(() => {
    return formatDateTime(lastCheckedAt) || t('settings.update.neverChecked', 'Not checked yet')
  }, [lastCheckedAt, t])

  const openReleasePage = (releaseUrl?: string) => {
    window.open(releaseUrl || getReleasesPageUrl(), '_blank', 'noopener,noreferrer')
  }

  const handleCheck = async () => {
    setState({ phase: 'checking' })
    const checkedAt = new Date().toISOString()
    try {
      const update = await checkAppUpdate(channel)
      if (update) {
        setState({
          phase: 'available',
          update,
          currentVersion: update.currentVersion,
          latestVersion: update.latestVersion,
        })
      } else {
        setState({ phase: 'latest', currentVersion: getFallbackCurrentVersion() })
      }
      setLastUpdateCheckAt(channel, checkedAt)
      setLastCheckedAtState(checkedAt)
    } catch (err) {
      setLastUpdateCheckAt(channel, checkedAt)
      setLastCheckedAtState(checkedAt)
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
      await downloadAndInstallAppUpdate(channel, ({ progress, downloaded, total }: AppUpdateDownloadState) => {
        setState((prev) => {
          const activeUpdate = prev.phase === 'downloading' ? prev.update : update
          return {
            phase: 'downloading',
            update: activeUpdate,
            progress,
            downloaded,
            total,
          }
        })
      })
      setState({ phase: 'ready', update })
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Download failed',
      })
    }
  }

  const handleRestart = async () => {
    const currentState = state
    if (currentState.phase !== 'ready') return
    try {
      await invoke('restart_app')
    } catch (err) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Restart failed',
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {t('settings.update.source', 'Updates from release channel manifests')}
              </p>
              <button
                onClick={() => openReleasePage()}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-info "
              >
                <ArrowUpRight className="h-3 w-3" />
                {t('settings.update.viewReleases', 'View Releases')}
              </button>
            </div>

            <button
              type="button"
              onClick={handleCheck}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-info/40 bg-info px-3 py-2 text-xs font-semibold text-white shadow-sm focus-ring motion-color hover:bg-info/90"
            >
              <RefreshCw className="h-4 w-4" />
              {t('settings.update.checkNow', 'Check for updates now')}
            </button>

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t('settings.update.lastCheckedAt', 'Last checked')}
              </span>
              <span className="text-foreground/70 font-mono">{lastCheckedLabel}</span>
            </div>
          </div>
        )

      case 'checking':
        return (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-info" />
            <span className="text-sm text-muted-foreground">
              {t('settings.update.checking', 'Checking for updates...')}
            </span>
          </div>
        )

      case 'latest': {
        const currentVersion = state.currentVersion !== '0.0.0' ? state.currentVersion : '—'
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-success/20 bg-success/5 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-success/15 p-1.5">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t('settings.update.result.upToDate', 'You are up to date!')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('settings.update.result.upToDateDesc', 'Running the latest version')}
                  </p>
                </div>
              </div>
              <div className="pt-2">
                <VersionBadge version={currentVersion} label="Latest" />
              </div>
            </div>

            <button
              onClick={handleCheck}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted focus-ring"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('settings.update.checkAgain', 'Check again')}
            </button>
          </div>
        )
      }

      case 'available': {
        const { currentVersion, latestVersion } = state
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-info/30 bg-info/5 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-info/15 p-1.5">
                  <ArrowUpRight className="h-5 w-5 text-info" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {t('settings.update.result.hasUpdate', 'New version available')}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <VersionBadge version={currentVersion} />
                    <span className="text-muted-foreground text-sm">→</span>
                    <VersionBadge version={latestVersion} label="New" />
                  </div>
                </div>
              </div>

              {state.update.releaseNotesMarkdown && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5 font-medium">
                    {t('settings.update.releaseNotes', 'Release Notes')}
                  </p>
                  <ReleaseNotesPreview body={state.update.releaseNotesMarkdown} />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={desktopRuntime ? handleDownload : () => openReleasePage(state.update.releaseUrl)}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground focus-ring hover:bg-primary/90"
              >
                <Download className="h-4 w-4" />
                {desktopRuntime
                  ? t('settings.update.downloadAndInstall', 'Download & Install')
                  : t('settings.update.viewOnGitHub', 'View on GitHub')}
              </button>
              <div className="flex items-center justify-between">
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted motion-context"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t('settings.update.later', 'Remind me later')}
                </button>
                <button
                  onClick={() => openReleasePage(state.update.releaseUrl)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-info hover:text-info/80"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  {t('settings.update.viewOnGitHub', 'View on GitHub')}
                </button>
              </div>
            </div>
          </div>
        )
      }

      case 'downloading': {
        const { progress, downloaded, total } = state
        const estimatedSize = total ? formatBytes(total) : '—'
        const progressText = total ? `${progress.toFixed(0)}%` : t('settings.update.checking', 'Checking for updates...')

        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-info" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {t('settings.update.downloading', 'Downloading update...')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatBytes(downloaded)} / {estimatedSize}
                  </p>
                </div>
                <span className="text-lg font-mono font-semibold text-info">
                  {progressText}
                </span>
              </div>

              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary motion-width"
                  style={{ width: `${Math.min(progress || 8, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )
      }

      case 'ready':
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-success/20 bg-success/5 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-success/15 p-1.5">
                  <Zap className="h-5 w-5 text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {t('settings.update.ready', 'Update installed')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('settings.update.readyDesc', 'Restart to finish applying the update')}
                  </p>
                  <div className="mt-2">
                    <VersionBadge version={state.update.latestVersion} />
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleRestart}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-success px-3 py-2 text-xs font-medium text-white focus-ring hover:bg-success/90"
            >
              <Download className="h-4 w-4" />
              {t('settings.update.installAndRestart', 'Restart Now')}
            </button>

            <button
              onClick={handleReset}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              {t('settings.update.cancel', 'Cancel')}
            </button>
          </div>
        )

      case 'error':
        return (
          <div className="space-y-4">
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-full bg-destructive/15 p-1.5">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t('settings.update.error', 'Update check failed')}
                  </p>
                  <p className="text-xs text-destructive/70 mt-0.5 font-mono break-all">
                    {state.message}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCheck}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted motion-context"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('settings.update.retry', 'Retry')}
              </button>
              <button
                onClick={() => openReleasePage()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-info hover:text-info/80"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                {t('settings.update.viewOnGitHub', 'View on GitHub')}
              </button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      <SettingsCard
        title={t('settings.update.title', 'Updates')}
        description={t(
          'settings.update.description',
          'Manage app updates from release channel manifests',
        )}
        icon={<Download className="h-4 w-4" />}
        contentClassName="p-0"
      >
        <div className="divide-y divide-border/40">
          <div className="px-3 py-3">
            <SettingsToggleRow
              title={t('settings.update.autoCheck', 'Auto Check Updates')}
              description={t('settings.update.autoCheckHelp', 'Automatically check for updates on app startup')}
              checked={settings.update.autoCheck !== false}
              onChange={(enabled) => onUpdate('update', 'autoCheck', enabled)}
              descriptionClassName="mt-1 text-xs leading-relaxed text-muted-foreground"
              searchKey="update-auto-check"
            />
          </div>

          <div className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]" data-settings-search="update-channel">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                {t('settings.update.channel.title', 'Update Channel')}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t('settings.update.channel.help', 'Stable: recommended for most users. Beta: early access to new features, may be unstable.')}
              </p>
            </div>
            <SettingsOptionGroup
              options={['stable', 'beta'] as const}
              value={channel}
              onChange={(nextChannel) => onUpdate('update', 'channel', nextChannel)}
              renderLabel={(optionChannel) => (
                <span className="flex items-center justify-center gap-1.5">
                  {optionChannel === 'stable' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {optionChannel === 'stable'
                    ? t('settings.update.channel.stable', 'Stable')
                    : t('settings.update.channel.beta', 'Beta')}
                </span>
              )}
              containerClassName="grid grid-cols-2 gap-1 rounded-md bg-secondary/35 p-1"
              optionClassName="border-0 py-1.5 shadow-none"
            />
          </div>

          <div className="px-3 py-3">
            {renderContent()}
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
