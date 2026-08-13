import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { listen } from '@/transport'
import { dismissUpdateVersion, getDismissedUpdateVersion } from '@/utils/updateChecker'
import { normalizeUpdateChannel } from '@/utils/updateChannel'
import {
  configureUpdateService,
  restartForUpdate,
  runUpdateCheck,
  useUpdateSnapshot,
  type UpdateNotice,
} from '@/utils/updateService'
import { SETTINGS_NAVIGATE_EVENT } from '@/components/settings/navigation'

export interface UseUpdateCheckerOptions {
  setShowSettings?: (show: boolean) => void
}

interface UseUpdateCheckerResult {
  notice: UpdateNotice | null
  closeNotice: () => void
  openUpdateSettings: () => void
  restartNow: () => void
  checkUpdate: () => void
}

function noticeKey(notice: UpdateNotice): string {
  return notice.kind === 'available'
    ? `${notice.update.channel}:${notice.update.latestVersion}`
    : `${notice.channel}:${notice.version}`
}

export function useUpdateChecker(options?: UseUpdateCheckerOptions): UseUpdateCheckerResult {
  const { settings, loading } = useSettings()
  const { status } = useUpdateSnapshot()
  const [snoozedKey, setSnoozedKey] = useState<string | null>(null)
  const setShowSettings = options?.setShowSettings
  const setShowSettingsRef = useRef(setShowSettings)

  useEffect(() => {
    setShowSettingsRef.current = setShowSettings
  }, [setShowSettings])

  const channel = normalizeUpdateChannel(settings.update.channel)
  const autoCheck = settings.update.autoCheck !== false

  useEffect(() => {
    if (loading) return
    configureUpdateService({ channel, autoCheck })
  }, [loading, channel, autoCheck])

  const notice = useMemo<UpdateNotice | null>(() => {
    if (status.kind === 'pending-restart') {
      const candidate: UpdateNotice = {
        kind: 'ready',
        channel: status.channel,
        version: status.version,
      }
      return noticeKey(candidate) === snoozedKey ? null : candidate
    }

    if (status.kind !== 'available') return null
    const candidate: UpdateNotice = { kind: 'available', update: status.update }
    if (noticeKey(candidate) === snoozedKey) return null
    if (getDismissedUpdateVersion(status.update.channel) === status.update.latestVersion) return null
    return candidate
  }, [status, snoozedKey])

  const closeNotice = useCallback(() => {
    if (!notice) return
    // A staged build stays pending until restart, so only the reminder is hidden.
    if (notice.kind === 'available') {
      dismissUpdateVersion(notice.update.channel, notice.update.latestVersion)
    }
    setSnoozedKey(noticeKey(notice))
  }, [notice])

  const openUpdateSection = useCallback(() => {
    setShowSettingsRef.current?.(true)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(SETTINGS_NAVIGATE_EVENT, {
        detail: { section: 'updates' },
      }))
    }, 50)
  }, [])

  const openUpdateSettings = useCallback(() => {
    if (notice) setSnoozedKey(noticeKey(notice))
    openUpdateSection()
  }, [notice, openUpdateSection])

  const restartNow = useCallback(() => {
    void restartForUpdate()
  }, [])

  const checkUpdate = useCallback(() => {
    void runUpdateCheck({ manual: true })
    openUpdateSection()
  }, [openUpdateSection])

  // Native macOS app menu "Check for Updates".
  useEffect(() => {
    let unlistenFn: (() => void) | undefined

    listen<void>('menu-check-update', () => {
      checkUpdate()
    }).then((fn) => {
      unlistenFn = fn
    }).catch((err) => {
      const isNonTauri = !(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
      if (!isNonTauri) {
        console.warn('Failed to listen for menu-check-update event:', err)
      }
    })

    return () => {
      unlistenFn?.()
    }
  }, [checkUpdate])

  return {
    notice,
    closeNotice,
    openUpdateSettings,
    restartNow,
    checkUpdate,
  }
}
