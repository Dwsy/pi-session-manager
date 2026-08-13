import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getFallbackCurrentVersion } from '@/utils/appUpdater'
import {
  canInstallInApp,
  installAvailableUpdate,
  restartForUpdate,
  runUpdateCheck,
  useUpdateSnapshot,
  type UpdateStatus,
} from '@/utils/updateService'
import { getReleasesPageUrl, normalizeUpdateChannel } from '@/utils/updateChannel'
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  RotateCw,
  Zap,
} from 'lucide-react'
import MarkdownContent from '@/components/ui/MarkdownContent'
import SettingsCard from '@/components/settings/SettingsCard'
import SettingsOptionGroup from '@/components/settings/SettingsOptionGroup'
import SettingsToggleRow from '@/components/settings/SettingsToggleRow'
import type { UpdateSettingsProps } from '@/components/settings/types'

function resolveCurrentVersion(status: UpdateStatus): string {
  if (status.kind === 'available' || status.kind === 'installing') {
    return status.update.currentVersion
  }
  if (status.kind === 'up-to-date') return status.currentVersion
  return getFallbackCurrentVersion()
}

function formatDateTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString()
}

export default function UpdateSettings({ settings, onUpdate }: UpdateSettingsProps) {
  const { t } = useTranslation()
  const { status, lastCheckedAt } = useUpdateSnapshot()
  const channel = normalizeUpdateChannel(settings.update.channel)
  const desktopRuntime = canInstallInApp()

  const currentVersion = resolveCurrentVersion(status)
  const busy = status.kind === 'checking' || status.kind === 'installing'

  const renderStatusLine = (): ReactNode => {
    let icon: ReactNode = null
    let tone = 'text-muted-foreground'
    let text = ''

    switch (status.kind) {
      case 'idle':
        return null
      case 'checking':
        icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />
        text = t('settings.update.checking', 'Checking for updates...')
        break
      case 'up-to-date':
        icon = <CheckCircle2 className="h-3.5 w-3.5" />
        tone = 'text-success'
        text = t('settings.update.result.upToDate', 'You are up to date')
        break
      case 'available':
        icon = <ArrowUpRight className="h-3.5 w-3.5" />
        tone = 'text-info'
        text = t('settings.update.result.hasUpdate', 'New version v{{version}} available', {
          version: status.update.latestVersion,
        })
        break
      case 'installing':
        icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />
        tone = 'text-info'
        text = t('settings.update.installing', 'Installing v{{version}} in the background...', {
          version: status.update.latestVersion,
        })
        break
      case 'pending-restart':
        icon = <CheckCircle2 className="h-3.5 w-3.5" />
        tone = 'text-success'
        text = t('settings.update.pendingRestart', 'v{{version}} installed. Restart to start using it.', {
          version: status.version,
        })
        break
      case 'error':
        icon = <AlertCircle className="h-3.5 w-3.5" />
        tone = 'text-destructive'
        text = `${t('settings.update.error', 'Update check failed')}: ${status.message}`
        break
    }

    return (
      <div className={`flex items-start gap-2 text-xs ${tone}`}>
        <span className="mt-px shrink-0">{icon}</span>
        <span className="min-w-0 break-words">{text}</span>
      </div>
    )
  }

  const renderPrimaryAction = (): ReactNode => {
    const className =
      'inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground focus-ring motion-color hover:bg-primary/90'

    if (status.kind === 'pending-restart') {
      return (
        <button type="button" onClick={() => void restartForUpdate()} className={className}>
          <RotateCw className="h-3.5 w-3.5" />
          {t('settings.update.restartNow', 'Restart now')}
        </button>
      )
    }

    if (status.kind !== 'available') return null

    if (!desktopRuntime) {
      return (
        <button
          type="button"
          onClick={() => window.open(status.update.releaseUrl, '_blank', 'noopener,noreferrer')}
          className={className}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          {t('settings.update.viewOnGitHub', 'View on GitHub')}
        </button>
      )
    }

    return (
      <button type="button" onClick={() => void installAvailableUpdate()} className={className}>
        <Download className="h-3.5 w-3.5" />
        {t('settings.update.downloadAndInstall', 'Download & Install')}
      </button>
    )
  }

  return (
    <SettingsCard
      title={t('settings.update.title', 'Updates')}
      description={t('settings.update.description', 'Manage app updates from release channel manifests')}
      icon={<Download className="h-4 w-4" />}
      contentClassName="p-0"
    >
      <div className="divide-y divide-border/40">
        <div className="px-3 py-3">
          <SettingsToggleRow
            title={t('settings.update.autoCheck', 'Automatic updates')}
            description={t(
              'settings.update.autoCheckHelp',
              'Check every 30 minutes and install in the background. A restart applies the update.',
            )}
            checked={settings.update.autoCheck !== false}
            onChange={(enabled) => onUpdate('update', 'autoCheck', enabled)}
            descriptionClassName="mt-1 text-xs leading-relaxed text-muted-foreground"
            searchKey="update-auto-check"
          />
        </div>

        <div
          className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]"
          data-settings-search="update-channel"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Zap className="h-3.5 w-3.5 text-muted-foreground" />
              {t('settings.update.channel.title', 'Update Channel')}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t(
                'settings.update.channel.help',
                'Stable: recommended for most users. Beta: early access to new features, may be unstable.',
              )}
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

        <div className="space-y-3 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-xs text-muted-foreground">
              <span className="font-mono text-foreground/80">v{currentVersion}</span>
              <span className="mx-1.5 text-border">·</span>
              {t('settings.update.lastCheckedAt', 'Last checked')}{' '}
              {formatDateTime(lastCheckedAt) || t('settings.update.neverChecked', 'Never checked')}
            </p>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => void runUpdateCheck({ manual: true })}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground focus-ring motion-color hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${status.kind === 'checking' ? 'animate-spin' : ''}`} />
                {t('settings.update.checkNow', 'Check now')}
              </button>
              <button
                type="button"
                onClick={() => window.open(getReleasesPageUrl(), '_blank', 'noopener,noreferrer')}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground focus-ring motion-color hover:bg-muted hover:text-foreground"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                {t('settings.update.viewReleases', 'View Releases')}
              </button>
            </div>
          </div>

          {renderStatusLine()}

          {status.kind === 'installing' && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary motion-width"
                style={{ width: `${Math.max(Math.min(status.progress, 100), 4)}%` }}
              />
            </div>
          )}

          {status.kind === 'available' && status.update.releaseNotesMarkdown && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              <MarkdownContent content={status.update.releaseNotesMarkdown} />
            </div>
          )}

          {renderPrimaryAction()}
        </div>
      </div>
    </SettingsCard>
  )
}
