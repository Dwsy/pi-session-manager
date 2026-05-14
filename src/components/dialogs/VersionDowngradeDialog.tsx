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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-2xl p-0 shadow-2xl w-[32rem] max-w-[95vw] overflow-hidden">
        {/* Warning Header */}
        <div className="bg-gradient-to-r from-orange-500/20 via-red-500/20 to-orange-500/20 px-6 py-5 border-b border-border">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/20 rounded-xl">
                <AlertTriangle className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {t('versionDowngrade.title', 'Version Downgrade Detected')}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('versionDowngrade.subtitle', 'Database compatibility issue')}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Warning Message */}
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
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
            <div className="bg-secondary/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('versionDowngrade.databaseSchema', 'Database Schema')}
                </span>
              </div>
              <p className="text-2xl font-bold text-orange-500">v{downgradeInfo.stored_schema_version}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('versionDowngrade.fromApp', 'from')} v{downgradeInfo.stored_app_version}
              </p>
            </div>
            <div className="bg-secondary/50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('versionDowngrade.maxSupported', 'Max Supported')}
                </span>
              </div>
              <p className="text-2xl font-bold text-primary">v{downgradeInfo.max_supported_schema_version}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('versionDowngrade.currentApp', 'app')} v{currentVersion}
              </p>
            </div>
          </div>

          {/* Database Path */}
          <div className="bg-secondary/30 rounded-lg px-4 py-2.5">
            <p className="text-xs text-muted-foreground truncate">
              <span className="font-medium">{t('versionDowngrade.dbPath', 'Database')}:</span>{' '}
              {downgradeInfo.db_path}
            </p>
          </div>

          {/* Last Updated */}
          <p className="text-xs text-muted-foreground text-center">
            {t('versionDowngrade.lastUpdated', 'Last updated')}: {formatDate(downgradeInfo.updated_at)}
          </p>

          {/* Instructions */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
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
              className={`rounded-xl p-4 ${
                state.phase === 'error'
                  ? 'bg-red-500/10 border border-red-500/20'
                  : state.phase === 'backup_success' || state.phase === 'reset_success'
                  ? 'bg-green-500/10 border border-green-500/20'
                  : 'bg-blue-500/10 border border-blue-500/20'
              }`}
            >
              {state.phase === 'backing_up' && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span className="text-sm text-foreground">
                    {t('versionDowngrade.backingUp', 'Backing up database...')}
                  </span>
                </div>
              )}
              {state.phase === 'backup_success' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
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
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span className="text-sm text-foreground">
                    {t('versionDowngrade.resetting', 'Resetting database...')}
                  </span>
                </div>
              )}
              {state.phase === 'reset_success' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-foreground">
                      {t('versionDowngrade.resetSuccess', 'Database reset successfully!')}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{state.message}</p>
                </div>
              )}
              {state.phase === 'error' && (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-500">{state.message}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 space-y-3">
          {/* Backup Button */}
          <button
            onClick={handleBackup}
            disabled={state.phase === 'backing_up' || state.phase === 'resetting'}
            className="w-full px-4 py-3 bg-secondary hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all flex items-center justify-center gap-2 group"
          >
            <Download className="h-4 w-4 group-hover:scale-110 transition-transform" />
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
            className="w-full px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all flex items-center justify-center gap-2 group shadow-lg shadow-orange-500/25"
          >
            <RefreshCw className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
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
            onClick={onClose}
            className="w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('versionDowngrade.continueAnyway', 'Continue anyway (not recommended)')}
          </button>
        </div>
      </div>
    </div>
  )
}
