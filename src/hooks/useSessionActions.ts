import { useCallback } from 'react'
import { invoke } from '@/transport'
import { save } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import type { SessionConvertResult, SessionConvertTarget, SessionInfo } from '@/types'

export interface UseSessionActionsReturn {
  handleExportSession: (session: SessionInfo, format: 'html' | 'md' | 'json') => Promise<void>
  handleConvertSession: (
    session: SessionInfo,
    target: SessionConvertTarget,
    options?: { dryRun?: boolean; force?: boolean }
  ) => Promise<SessionConvertResult | null>
}

export function useSessionActions(): UseSessionActionsReturn {
  const { t } = useTranslation()

  const handleExportSession = useCallback(async (session: SessionInfo, format: 'html' | 'md' | 'json') => {
    if (!session) {
      console.error('[useSessionActions] No session provided')
      return
    }

    const extension = format === 'md' ? 'md' : format
    const defaultPath = `${session.name || 'session'}.${extension}`

    const filePath = await save({
      filters: [{
        name: format.toUpperCase(),
        extensions: [extension]
      }],
      defaultPath
    })

    if (!filePath) {
      return
    }

    try {
      await invoke('export_session', {
        path: session.path,
        format,
        outputPath: filePath
      })

      alert(t('app.errors.exportSuccess'))
    } catch (error) {
      console.error('[useSessionActions] Export failed:', error)
      alert(`${t('app.errors.exportFailed')}: ${error}`)
    }
  }, [t])

  const handleConvertSession = useCallback(async (
    session: SessionInfo,
    target: SessionConvertTarget,
    options: { dryRun?: boolean; force?: boolean } = {}
  ): Promise<SessionConvertResult | null> => {
    if (!session) {
      console.error('[useSessionActions] No session provided for conversion')
      return null
    }

    try {
      const result = await invoke<SessionConvertResult>('convert_session_format', {
        path: session.path,
        target_format: target,
        dry_run: options.dryRun ?? false,
        force: options.force ?? false,
      })
      return result
    } catch (error) {
      console.error('[useSessionActions] Conversion failed:', error)
      alert(`${t('session.convert.failed')}: ${error}`)
      return null
    }
  }, [t])

  return {
    handleExportSession,
    handleConvertSession,
  }
}
