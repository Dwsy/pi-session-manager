import { useCallback } from 'react'
import { invoke } from '../transport'
import { save } from '@tauri-apps/plugin-dialog'
import { useTranslation } from 'react-i18next'
import type { SessionInfo } from '../types'

export interface UseSessionActionsReturn {
  handleExportSession: (session: SessionInfo, format: 'html' | 'md' | 'json') => Promise<void>
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

  return {
    handleExportSession,
  }
}
