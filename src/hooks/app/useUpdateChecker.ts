import { useCallback, useEffect, useState } from 'react'
import { useSettings } from '@/hooks/useSettings'
import {
  checkForUpdates,
  dismissUpdateVersion,
  getDismissedUpdateVersion,
  shouldRunDailyUpdateCheck,
  type AvailableUpdateInfo,
} from '@/utils/updateChecker'
import { normalizeUpdateChannel } from '@/utils/updateChannel'

interface UseUpdateCheckerResult {
  updateInfo: AvailableUpdateInfo | null
  closeUpdateNotice: () => void
  openUpdateReleasePage: () => void
}

export function useUpdateChecker(): UseUpdateCheckerResult {
  const { settings, loading } = useSettings()
  const [updateInfo, setUpdateInfo] = useState<AvailableUpdateInfo | null>(null)

  useEffect(() => {
    if (loading) return

    const channel = normalizeUpdateChannel(settings.update.channel)
    if (!settings.update.autoCheck || !shouldRunDailyUpdateCheck(channel)) {
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

  const openUpdateReleasePage = useCallback(() => {
    setUpdateInfo((previous) => {
      if (!previous) return null
      dismissUpdateVersion(previous.channel, previous.latestVersion)
      window.open(previous.releaseUrl, '_blank', 'noopener,noreferrer')
      return null
    })
  }, [])

  return {
    updateInfo,
    closeUpdateNotice,
    openUpdateReleasePage,
  }
}
