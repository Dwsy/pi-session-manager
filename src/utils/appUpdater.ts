import { invoke, isTauri, listen } from '@/transport'
import {
  checkForUpdates,
  getCurrentAppVersion,
  setLastUpdateCheckAt,
  type AvailableUpdateInfo,
} from './updateChecker'
import { getReleaseUrl, normalizeUpdateChannel, type UpdateChannel } from './updateChannel'

interface AppUpdateMetadata {
  currentVersion: string
  version: string
  date?: string | null
  body?: string | null
  rawJson?: Record<string, unknown>
}

interface AppUpdateDownloadEventEnvelope {
  event: 'Started' | 'Progress' | 'Finished'
  data?: {
    contentLength?: number
    chunkLength?: number
  }
}

export interface AppUpdateDownloadState {
  progress: number
  downloaded: number
  total: number | null
}

export async function checkAppUpdate(channelInput: UpdateChannel | string): Promise<AvailableUpdateInfo | null> {
  const channel = normalizeUpdateChannel(channelInput)
  const checkedAt = new Date().toISOString()

  if (!isTauri()) {
    const result = await checkForUpdates(channel)
    return result.status === 'update' ? result.update : null
  }

  try {
    const update = await invoke<AppUpdateMetadata | null>('check_app_update', { channel })
    if (!update) return null
    return {
      channel,
      currentVersion: update.currentVersion,
      latestVersion: update.version,
      releaseUrl: getReleaseUrl(update.version),
      releaseName: `Pi Session Manager v${update.version}`,
      releaseNotes: (update.body || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200),
      releaseNotesMarkdown: update.body || '',
      publishedAt: update.date || null,
    }
  } finally {
    setLastUpdateCheckAt(channel, checkedAt)
  }
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `update-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function downloadAndInstallAppUpdate(
  channelInput: UpdateChannel | string,
  onProgress?: (state: AppUpdateDownloadState) => void,
): Promise<void> {
  if (!isTauri()) {
    throw new Error('In-app updater is only available in the desktop app')
  }

  const channel = normalizeUpdateChannel(channelInput)
  const requestId = createRequestId()
  const eventName = `app-updater-progress:${requestId}`
  let downloaded = 0
  let total: number | null = null

  const unlisten = await listen<AppUpdateDownloadEventEnvelope>(eventName, ({ payload }) => {
    if (payload.event === 'Started') {
      total = payload.data?.contentLength ?? null
      downloaded = 0
      onProgress?.({ progress: 0, downloaded, total })
      return
    }

    if (payload.event === 'Progress') {
      downloaded += payload.data?.chunkLength ?? 0
      const progress = total && total > 0 ? (downloaded / total) * 100 : 0
      onProgress?.({ progress, downloaded, total })
      return
    }

    if (payload.event === 'Finished') {
      onProgress?.({ progress: 100, downloaded, total })
    }
  })

  try {
    await invoke('download_and_install_app_update', { channel, requestId })
  } finally {
    unlisten()
  }
}

export function getFallbackCurrentVersion(): string {
  return getCurrentAppVersion()
}
