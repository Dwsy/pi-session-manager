import { useCallback, useEffect, useRef, useState } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { listen } from '@/transport'
import { checkAppUpdate } from '@/utils/appUpdater'
import {
  dismissUpdateVersion,
  getDismissedUpdateVersion,
  type AvailableUpdateInfo,
} from '@/utils/updateChecker'
import { normalizeUpdateChannel } from '@/utils/updateChannel'
import { SETTINGS_NAVIGATE_EVENT } from '@/components/settings/navigation'

export interface UseUpdateCheckerOptions {
  setShowSettings?: (show: boolean) => void
}

interface UseUpdateCheckerResult {
  updateInfo: AvailableUpdateInfo | null
  closeUpdateNotice: () => void
  openUpdateSettings: () => void
  checkUpdate: () => void
}

export function useUpdateChecker(options?: UseUpdateCheckerOptions): UseUpdateCheckerResult {
  const { settings, loading } = useSettings()
  const [updateInfo, setUpdateInfo] = useState<AvailableUpdateInfo | null>(null)
  const setShowSettings = options?.setShowSettings
  const setShowSettingsRef = useRef(setShowSettings)
  useEffect(() => {
    setShowSettingsRef.current = setShowSettings
  }, [setShowSettings])

  useEffect(() => {
    if (loading) return

    const channel = normalizeUpdateChannel(settings.update.channel)
    if (!settings.update.autoCheck) {
      return
    }

    let active = true
    const run = async () => {
      try {
        // Must share the same path as Settings manual check:
        // desktop uses Tauri installed version; browser falls back to frontend check.
        const update = await checkAppUpdate(channel)
        if (!active || !update) return

        const dismissedVersion = getDismissedUpdateVersion(channel)
        if (dismissedVersion === update.latestVersion) return
        setUpdateInfo(update)
      } catch {
        // Startup auto-check is silent on network / updater failures.
      }
    }

    void run()
    return () => {
      active = false
    }
  }, [loading, settings.update.autoCheck, settings.update.channel])

  const closeUpdateNotice = useCallback(() => {
    setUpdateInfo((previous) => {
      if (previous) {
        dismissUpdateVersion(previous.channel, previous.latestVersion)
      }
      return null
    })
  }, [])

  // Shared helper to open settings and navigate to update section
  const openUpdateSection = useCallback(() => {
    const currentSetShowSettings = setShowSettingsRef.current
    if (currentSetShowSettings) {
      currentSetShowSettings(true)
    }
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(SETTINGS_NAVIGATE_EVENT, {
        detail: { section: 'app-behavior' },
      }))
    }, 50)
  }, [])

  const openUpdateSettings = useCallback(() => {
    const updateToOpen = updateInfo
    if (!updateToOpen) return

    // Dismiss the notice and close it
    dismissUpdateVersion(updateToOpen.channel, updateToOpen.latestVersion)
    setUpdateInfo(null)

    openUpdateSection()
  }, [updateInfo, openUpdateSection])

  // Listen for native menu "Check for Updates" event from macOS app menu
  useEffect(() => {
    let unlistenFn: (() => void) | undefined
    
    listen<void>('menu-check-update', () => {
      openUpdateSection()
    }).then((fn) => {
      unlistenFn = fn
    }).catch((err) => {
      // Only ignore expected errors in non-Tauri environments
      const isNonTauri = !(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
      if (!isNonTauri) {
        console.warn('Failed to listen for menu-check-update event:', err)
      }
    })

    return () => {
      unlistenFn?.()
    }
  }, [openUpdateSection])

  // Manual check update from menu (exposed for external use)
  const checkUpdate = openUpdateSection

  return {
    updateInfo,
    closeUpdateNotice,
    openUpdateSettings,
    checkUpdate,
  }
}
