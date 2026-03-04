import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import SettingsCard from '../SettingsCard'
import SettingsToggleRow from '../SettingsToggleRow'
import type { UpdateSettingsProps } from '../types'
import { checkForUpdates, getLastUpdateCheckAt } from '../../../utils/updateChecker'

type CheckMessage =
  | { type: 'success'; text: string }
  | { type: 'error'; text: string }
  | { type: 'update'; text: string; releaseUrl: string }

function formatDateTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

export default function UpdateSettings({ settings, onUpdate }: UpdateSettingsProps) {
  const { t } = useTranslation()
  const [checking, setChecking] = useState(false)
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(() =>
    getLastUpdateCheckAt(),
  )
  const [message, setMessage] = useState<CheckMessage | null>(null)

  const lastCheckedLabel = useMemo(() => {
    return (
      formatDateTime(lastCheckedAt) ||
      t('settings.update.neverChecked', '尚未检测')
    )
  }, [lastCheckedAt, t])

  const handleManualCheck = async () => {
    setChecking(true)
    setMessage(null)
    const result = await checkForUpdates()
    setLastCheckedAt(result.checkedAt)

    if (result.status === 'update') {
      setMessage({
        type: 'update',
        text: t(
          'settings.update.result.hasUpdate',
          '发现新版本 v{{latest}}（当前 v{{current}}）',
          {
            latest: result.update.latestVersion,
            current: result.update.currentVersion,
          },
        ),
        releaseUrl: result.update.releaseUrl,
      })
      setChecking(false)
      return
    }

    if (result.status === 'latest') {
      setMessage({
        type: 'success',
        text: t(
          'settings.update.result.upToDate',
          '当前已是最新版本（v{{version}}）',
          { version: result.currentVersion },
        ),
      })
      setChecking(false)
      return
    }

    setMessage({
      type: 'error',
      text: t('settings.update.result.failed', '检测失败：{{reason}}', {
        reason: result.errorMessage,
      }),
    })
    setChecking(false)
  }

  const openReleasePage = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6">
      <SettingsCard
        title={t('settings.update.title', '更新')}
        description={t(
          'settings.update.description',
          '基于 GitHub Releases 检测新版本',
        )}
        icon={<Download className="h-4 w-4" />}
      >
        <div className="space-y-4">
          <SettingsToggleRow
            title={t('settings.update.autoCheck', '自动检查更新')}
            description={t(
              'settings.update.autoCheckHelp',
              '默认每天自动检测一次',
            )}
            checked={settings.update.autoCheck !== false}
            onChange={(checked) => onUpdate('update', 'autoCheck', checked)}
          />

          <div className="pt-3 border-t border-border/60 space-y-3">
            <button
              onClick={handleManualCheck}
              disabled={checking}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-info hover:bg-info/90 text-white text-sm font-medium disabled:opacity-60 motion-color motion-press focus-ring"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              {checking
                ? t('settings.update.checking', '检测中...')
                : t('settings.update.checkNow', '立即检查更新')}
            </button>

            <p className="text-xs text-muted-foreground">
              {t('settings.update.lastCheckedAt', '最近检测时间')}: {lastCheckedLabel}
            </p>

            {message && (
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  message.type === 'error'
                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                    : message.type === 'update'
                      ? 'border-info/30 bg-info/10 text-info'
                      : 'border-green-500/30 bg-green-500/10 text-green-300'
                }`}
              >
                <div className="flex items-start gap-2">
                  {message.type === 'error' ? (
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  ) : message.type === 'update' ? (
                    <Download className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p>{message.text}</p>
                    {message.type === 'update' && (
                      <button
                        onClick={() => openReleasePage(message.releaseUrl)}
                        className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-info/20 hover:bg-info/30 text-info motion-color motion-press focus-ring"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t('settings.update.openRelease', '打开发布页')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
