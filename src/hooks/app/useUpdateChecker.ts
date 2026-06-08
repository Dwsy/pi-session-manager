import { useCallback, useEffect, useState } from 'react'
import { useSettings } from '@/hooks/useSettings'
import {
  checkForUpdates,
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
}

export function useUpdateChecker(options?: UseUpdateCheckerOptions): UseUpdateCheckerResult {
  const { settings, loading } = useSettings()
  const [updateInfo, setUpdateInfo] = useState<AvailableUpdateInfo | null>(null)
  const setShowSettings = options?.setShowSettings

  useEffect(() => {
    if (loading) return

    const channel = normalizeUpdateChannel(settings.update.channel)
    if (!settings.update.autoCheck) {
      return
    }

    let active = true
    const run = async () => {
      const result = await checkForUpdates(channel)
      if (!active || result.status !== 'update') return

      const dismissedVersion = getDismissedUpdateVersion(channel)
      if (dismissedVersion === result.update.latestVersion) return
      setUpdateInfo(result.update)
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

  const openUpdateSettings = useCallback(() => {
    const updateToOpen = updateInfo
    if (!updateToOpen) return

    // Dismiss the notice and close it
    dismissUpdateVersion(updateToOpen.channel, updateToOpen.latestVersion)
    setUpdateInfo(null)

    // Open settings panel and navigate to update section
    if (setShowSettings) {
      setShowSettings(true)
    }
    
    // Dispatch navigation event to switch to app-behavior section (contains UpdateSettings)
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(SETTINGS_NAVIGATE_EVENT, {
        detail: { section: 'app-behavior' },
      }))
    }, 50)
  }, [updateInfo, setShowSettings])

  return {
    updateInfo,
    closeUpdateNotice,
    openUpdateSettings,
  }
}
