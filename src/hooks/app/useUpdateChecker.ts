import { useCallback, useEffect, useState } from 'react'
import {
  checkForUpdates,
  dismissUpdateVersion,
  getDismissedUpdateVersion,
  type AvailableUpdateInfo,
} from '@/utils/updateChecker'

interface UseUpdateCheckerResult {
  updateInfo: AvailableUpdateInfo | null
  closeUpdateNotice: () => void
  openUpdateReleasePage: () => void
}

export function useUpdateChecker(): UseUpdateCheckerResult {
  const [updateInfo, setUpdateInfo] = useState<AvailableUpdateInfo | null>(null)

  useEffect(() => {
    let active = true
    const run = async () => {
      const result = await checkForUpdates()
      if (!active || result.status !== 'update') return

      const dismissedVersion = getDismissedUpdateVersion()
      if (dismissedVersion === result.update.latestVersion) return
      setUpdateInfo(result.update)
    }

    void run()
    return () => {
      active = false
    }
  }, [])

  const closeUpdateNotice = useCallback(() => {
    setUpdateInfo((previous) => {
      if (previous) {
        dismissUpdateVersion(previous.latestVersion)
      }
      return null
    })
  }, [])

  const openUpdateReleasePage = useCallback(() => {
    setUpdateInfo((previous) => {
      if (!previous) return null
      dismissUpdateVersion(previous.latestVersion)
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
