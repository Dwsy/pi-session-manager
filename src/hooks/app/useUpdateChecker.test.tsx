// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useSettings', () => ({
  useSettings: vi.fn(),
}))

vi.mock('@/transport', () => ({
  isTauri: vi.fn(),
  listen: vi.fn(),
}))

vi.mock('@/utils/appUpdater', () => ({
  checkAppUpdate: vi.fn(),
  downloadAndInstallAppUpdate: vi.fn(),
}))

vi.mock('@/utils/updateChecker', () => ({
  dismissUpdateVersion: vi.fn(),
  getDismissedUpdateVersion: vi.fn(),
}))

vi.mock('@/utils/updateChannel', () => ({
  normalizeUpdateChannel: (channel: string) => channel === 'beta' ? 'beta' : 'stable',
}))

import { useSettings } from '@/hooks/useSettings'
import { isTauri, listen } from '@/transport'
import { checkAppUpdate, downloadAndInstallAppUpdate } from '@/utils/appUpdater'
import { getDismissedUpdateVersion } from '@/utils/updateChecker'
import { useUpdateChecker } from './useUpdateChecker'

const update = {
  channel: 'stable' as const,
  currentVersion: '0.7.3',
  latestVersion: '0.7.4',
  releaseUrl: 'https://example.test/releases/v0.7.4',
  releaseName: 'Pi Session Manager v0.7.4',
  releaseNotes: '',
  releaseNotesMarkdown: '',
  publishedAt: null,
}

describe('useUpdateChecker', () => {
  beforeEach(() => {
    vi.mocked(useSettings).mockReturnValue({
      settings: { update: { autoCheck: true, channel: 'stable' } },
      loading: false,
    } as ReturnType<typeof useSettings>)
    vi.mocked(isTauri).mockReturnValue(true)
    vi.mocked(listen).mockResolvedValue(() => undefined)
    vi.mocked(checkAppUpdate).mockResolvedValue(update)
    vi.mocked(downloadAndInstallAppUpdate).mockResolvedValue()
    vi.mocked(getDismissedUpdateVersion).mockReturnValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('downloads an available desktop update and opens the Updates settings section', async () => {
    const setShowSettings = vi.fn()
    const navigate = vi.fn()
    window.addEventListener('psm-settings:navigate', navigate)

    const { result } = renderHook(() => useUpdateChecker({ setShowSettings }))

    await waitFor(() => {
      expect(downloadAndInstallAppUpdate).toHaveBeenCalledWith('stable')
    })
    expect(result.current.updateInfo).toEqual(update)

    act(() => {
      result.current.openUpdateSettings()
    })

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(expect.objectContaining({
        detail: { section: 'updates' },
      }))
    })
    expect(setShowSettings).toHaveBeenCalledWith(true)
    window.removeEventListener('psm-settings:navigate', navigate)
  })
})
