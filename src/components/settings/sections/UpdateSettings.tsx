import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { check, Update } from '@tauri-apps/plugin-updater'
import { getCurrentAppVersion } from '@/utils/updateChecker'
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
import SettingsField from '@/components/settings/SettingsField'
import SettingsOptionGroup from '@/components/settings/SettingsOptionGroup'
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

/**
 * Current version badge displayed at top of the card
 */
function VersionBadge({ version, label }: { version: string; label?: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="px-2.5 py-1 rounded-md bg-info/10 border border-info/20 text-info font-mono text-sm">
        v{version}
      </span>
      {label && (
        <span className="px-2 py-0.5 rounded-full bg-success/10 border border-success/20 text-success text-xs font-medium">
          {label}
        </span>
      )}
    </div>
  )
}

/**
 * Release notes preview — rendered as sanitized markdown-ish text
 */
function ReleaseNotesPreview({ body }: { body: string }) {
  const lines = body.split('\n').filter(Boolean).slice(0, 6)
  const hasMore = body.split('\n').filter(Boolean).length > 6

  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 p-3 space-y-1 max-h-32 overflow-y-auto text-xs">
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
        setState({ phase: 'latest', currentVersion: getCurrentAppVersion() })
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

  const openReleasePage = () => {
    window.open('https://github.com/Dwsy/pi-session-manager/releases', '_blank', 'noopener,noreferrer')
  }

  /* ─── State renderers ─── */

  const renderContent = () => {
    switch (state.phase) {
      case 'idle':
        return (
          <div className="space-y-4">
            {/* Quick info */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {t('settings.update.source', 'Updates from GitHub Releases')}
              </p>
              <button
                onClick={openReleasePage}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-info transition-colors"
              >
                <ArrowUpRight className="h-3 w-3" />
                {t('settings.update.viewReleases', 'View Releases')}
              </button>
            </div>

            {/* Check now button */}
            <button
              onClick={handleCheck}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-info hover:bg-info/90 text-white text-sm font-medium motion-color motion-press focus-ring"
            >
              <RefreshCw className="h-4 w-4" />
              {t('settings.update.checkNow', 'Check for updates now')}
            </button>

            {/* Last checked */}
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
            {/* Up-to-date card */}
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

            {/* Check again */}
            <button
              onClick={handleCheck}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted motion-color motion-press focus-ring"
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
            {/* Update available card */}
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

              {/* Release notes */}
              {state.update.body && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5 font-medium">
                    {t('settings.update.releaseNotes', 'Release Notes')}
                  </p>
                  <ReleaseNotesPreview body={state.update.body} />
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleDownload}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-info hover:bg-info/90 text-white text-sm font-medium motion-color motion-press focus-ring"
              >
                <Download className="h-4 w-4" />
                {t('settings.update.downloadAndInstall', 'Download & Install')}
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
                  onClick={openReleasePage}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-info hover:text-info/80 motion-color"
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

        return (
          <div className="space-y-4">
            {/* Progress card */}
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
                  {progress.toFixed(0)}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-info to-info/60 rounded-full motion-width"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
          </div>
        )
      }

      case 'ready':
        return (
          <div className="space-y-4">
            {/* Ready to install */}
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
                    <VersionBadge version={state.update.version} />
                  </div>
                </div>
              </div>
            </div>

            {/* Install button */}
            <button
              onClick={handleRestart}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-success hover:bg-success/90 text-white text-sm font-medium motion-color motion-press focus-ring"
            >
              <Download className="h-4 w-4" />
              {t('settings.update.installAndRestart', 'Restart Now')}
            </button>

            {/* Skip option */}
            <button
              onClick={handleReset}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground motion-color"
            >
              {t('settings.update.cancel', 'Cancel')}
            </button>
          </div>
        )

      case 'error':
        return (
          <div className="space-y-4">
            {/* Error card */}
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

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCheck}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted motion-context"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('settings.update.retry', 'Retry')}
              </button>
              <button
                onClick={openReleasePage}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-info hover:text-info/80 motion-color"
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
    <div className="space-y-6">
      {/* Main update card */}
      <SettingsCard
        title={t('settings.update.title', 'Updates')}
        description={t(
          'settings.update.description',
          'Manage app updates from GitHub Releases',
        )}
        icon={<Download className="h-4 w-4" />}
      >
        <div className="space-y-5">
          {renderContent()}
        </div>
      </SettingsCard>

      {/* Update channel card */}
      <SettingsCard
        title={t('settings.update.channel.title', 'Update Channel')}
        description={t(
          'settings.update.channel.description',
          'Choose which release track to receive updates from',
        )}
        icon={<Zap className="h-4 w-4" />}
        searchKey="update-channel"
      >
        <SettingsField label={t('settings.update.channel.label', 'Channel')}>
          <SettingsOptionGroup
            options={['stable', 'beta'] as const}
            value={(settings.update.channel as 'stable' | 'beta') ?? 'stable'}
            onChange={(channel) => onUpdate('update', 'channel', channel)}
            renderLabel={(channel) => (
              <span className="flex items-center gap-1.5">
                {channel === 'stable' ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {t('settings.update.channel.stable', 'Stable')}
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5" />
                    {t('settings.update.channel.beta', 'Beta')}
                  </>
                )}
              </span>
            )}
            containerClassName="grid grid-cols-2 gap-2"
            optionClassName="py-2"
          />
          <p className="text-xs text-muted-foreground mt-2">
            {t(
              'settings.update.channel.help',
              'Stable: recommended for most users. Beta: early access to new features, may be unstable.',
            )}
          </p>
        </SettingsField>
      </SettingsCard>
    </div>
  )
}
