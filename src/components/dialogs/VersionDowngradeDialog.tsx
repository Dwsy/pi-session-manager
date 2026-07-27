import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import {
  AlertTriangle,
  Database,
  Download,
  RefreshCw,
  X,
  Loader2,
  CheckCircle2,
  HardDrive,
} from 'lucide-react'

interface VersionDowngradeInfo {
  stored_app_version: string
  stored_schema_version: number
  current_app_version: string
  max_supported_schema_version: number
  updated_at: string
  db_path: string
}

interface VersionDowngradeDialogProps {
  downgradeInfo: VersionDowngradeInfo
  currentVersion: string
  onClose: () => void
  onContinue: () => void | Promise<void>
  onResetComplete: () => void
}

type OperationState =
  | { phase: 'idle' }
  | { phase: 'backing_up' }
  | { phase: 'backup_success'; path: string }
  | { phase: 'resetting' }
  | { phase: 'reset_success'; message: string }
  | { phase: 'error'; message: string }

export default function VersionDowngradeDialog({
  downgradeInfo,
  currentVersion,
  onClose,
  onContinue,
  onResetComplete,
}: VersionDowngradeDialogProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<OperationState>({ phase: 'idle' })

  const handleBackup = async () => {
    setState({ phase: 'backing_up' })
    try {
      const result = await invoke<string>('backup_database')
      setState({ phase: 'backup_success', path: result })
    } catch (error) {
      setState({ phase: 'error', message: String(error) })
    }
  }

  const handleReset = async () => {
    setState({ phase: 'resetting' })
    try {
      const result = await invoke<string>('reset_database')
      setState({ phase: 'reset_success', message: result })
      // Auto-close after successful reset
      setTimeout(() => {
        onResetComplete()
      }, 2000)
    } catch (error) {
      setState({ phase: 'error', message: String(error) })
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleString()
    } catch {
      return dateStr
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="version-downgrade-title" className="max-h-[92vh] w-[32rem] max-w-full overflow-y-auto rounded-lg border border-border bg-background shadow-xl">
        {/* Warning Header */}
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="mt-0.5 text-warning">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 id="version-downgrade-title" className="text-lg font-semibold text-foreground">
                  {t('versionDowngrade.title', 'Version Downgrade Detected')}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('versionDowngrade.subtitle', 'Database compatibility issue')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close', 'Close')}
              className="focus-ring rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 p-5">
          {/* Warning Message */}
          <div className="border-l-2 border-warning/50 pl-3">
            <p className="text-sm text-foreground leading-relaxed">
              {t(
                'versionDowngrade.message',
                'This database has a newer schema version (v{{stored}}) than what the current app supports (v{{current}}). Using it may cause data loss or corruption.',
                { stored: downgradeInfo.stored_schema_version, current: downgradeInfo.max_supported_schema_version }
              )}
            </p>
          </div>

          {/* Version Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('versionDowngrade.databaseSchema', 'Database Schema')}
                </span>
              </div>
              <p className="text-xl font-semibold tabular-nums text-warning">v{downgradeInfo.stored_schema_version}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('versionDowngrade.fromApp', 'from')} v{downgradeInfo.stored_app_version}
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('versionDowngrade.maxSupported', 'Max Supported')}
                </span>
              </div>
              <p className="text-xl font-semibold tabular-nums text-foreground">v{downgradeInfo.max_supported_schema_version}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('versionDowngrade.currentApp', 'app')} v{currentVersion}
              </p>
            </div>
          </div>

          {/* Database Path */}
          <div className="rounded-md border border-border px-3 py-2.5">
            <p className="text-xs text-muted-foreground truncate">
              <span className="font-medium">{t('versionDowngrade.dbPath', 'Database')}:</span>{' '}
              {downgradeInfo.db_path}
            </p>
          </div>

          {/* Last Updated */}
          <p className="text-xs text-muted-foreground">
            {t('versionDowngrade.lastUpdated', 'Last updated')}: {formatDate(downgradeInfo.updated_at)}
          </p>

          {/* Instructions */}
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground mb-2">
              {t('versionDowngrade.instructions.title', 'How to proceed:')}
            </p>
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>{t('versionDowngrade.instructions.step1', 'Backup your current database')}</li>
              <li>{t('versionDowngrade.instructions.step2', 'Reset the database for compatibility')}</li>
              <li>{t('versionDowngrade.instructions.step3', 'Rescan your sessions to rebuild the database')}</li>
            </ol>
          </div>

          {/* Operation Status */}
          {state.phase !== 'idle' && (
            <div
              className={`rounded-md border p-3 ${
                state.phase === 'error'
                  ? 'border-destructive/30 bg-destructive/5'
                  : state.phase === 'backup_success' || state.phase === 'reset_success'
                  ? 'border-success/30 bg-success/5'
                  : 'border-info/30 bg-info/5'
              }`}
            >
              {state.phase === 'backing_up' && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-info" />
                  <span className="text-sm text-foreground">
                    {t('versionDowngrade.backingUp', 'Backing up database...')}
                  </span>
                </div>
              )}
              {state.phase === 'backup_success' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium text-foreground">
                      {t('versionDowngrade.backupSuccess', 'Backup completed!')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {t('versionDowngrade.savedTo', 'Saved to')}: {state.path}
                  </p>
                </div>
              )}
              {state.phase === 'resetting' && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-info" />
                  <span className="text-sm text-foreground">
                    {t('versionDowngrade.resetting', 'Resetting database...')}
                  </span>
                </div>
              )}
              {state.phase === 'reset_success' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium text-foreground">
                      {t('versionDowngrade.resetSuccess', 'Database reset successfully!')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{state.message}</p>
                </div>
              )}
              {state.phase === 'error' && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">{state.message}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 border-t border-border px-5 py-4">
          {/* Backup Button */}
          <button
            onClick={handleBackup}
            disabled={state.phase === 'backing_up' || state.phase === 'resetting'}
            className="focus-ring flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span className="font-medium">
              {state.phase === 'backing_up'
                ? t('versionDowngrade.backingUp', 'Backing up...')
                : state.phase === 'backup_success'
                ? t('versionDowngrade.backupAgain', 'Backup Again')
                : t('versionDowngrade.backupButton', 'Backup Database')}
            </span>
          </button>

          {/* Reset Button */}
          <button
            onClick={handleReset}
            disabled={state.phase === 'backing_up' || state.phase === 'resetting' || state.phase === 'reset_success'}
            className="focus-ring flex w-full items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2.5 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="font-medium">
              {state.phase === 'resetting'
                ? t('versionDowngrade.resetting', 'Resetting...')
                : state.phase === 'reset_success'
                ? t('versionDowngrade.resetComplete', 'Reset Complete')
                : t('versionDowngrade.resetButton', 'Reset Database')}
            </span>
          </button>

          {/* Continue Anyway (Not Recommended) */}
          <button
            onClick={() => {
              void onContinue()
            }}
            className="focus-ring w-full rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {t('versionDowngrade.continueAnyway', 'Continue anyway (not recommended)')}
          </button>
        </div>
      </div>
    </div>
  )
}
