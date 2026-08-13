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
  restartApp: vi.fn(),
}))

import { useSettings } from '@/hooks/useSettings'
import { isTauri, listen } from '@/transport'
import { checkAppUpdate, downloadAndInstallAppUpdate } from '@/utils/appUpdater'
import { resetUpdateService } from '@/utils/updateService'
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
    localStorage.clear()
    resetUpdateService()
    vi.mocked(useSettings).mockReturnValue({
      settings: { update: { autoCheck: true, channel: 'stable' } },
      loading: false,
    } as ReturnType<typeof useSettings>)
    vi.mocked(isTauri).mockReturnValue(true)
    vi.mocked(listen).mockResolvedValue(() => undefined)
    vi.mocked(checkAppUpdate).mockResolvedValue(update)
    vi.mocked(downloadAndInstallAppUpdate).mockResolvedValue()
  })

  afterEach(() => {
    resetUpdateService()
    vi.clearAllMocks()
  })

  it('installs a desktop update in the background and then asks for a restart', async () => {
    const { result } = renderHook(() => useUpdateChecker({ setShowSettings: vi.fn() }))

    await waitFor(() => {
      expect(downloadAndInstallAppUpdate).toHaveBeenCalledWith('stable', expect.any(Function))
    })

    await waitFor(() => {
      expect(result.current.notice).toEqual({
        kind: 'ready',
        channel: 'stable',
        version: '0.7.4',
      })
    })
  })

  it('leaves the install to the user outside the desktop runtime', async () => {
    vi.mocked(isTauri).mockReturnValue(false)

    const { result } = renderHook(() => useUpdateChecker({ setShowSettings: vi.fn() }))

    await waitFor(() => {
      expect(result.current.notice).toEqual({ kind: 'available', update })
    })
    expect(downloadAndInstallAppUpdate).not.toHaveBeenCalled()
  })

  it('opens the Updates settings section from the notice', async () => {
    const setShowSettings = vi.fn()
    const navigate = vi.fn()
    window.addEventListener('psm-settings:navigate', navigate)

    const { result } = renderHook(() => useUpdateChecker({ setShowSettings }))
    await waitFor(() => {
      expect(result.current.notice).not.toBeNull()
    })

    act(() => {
      result.current.openUpdateSettings()
    })

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(expect.objectContaining({
        detail: { section: 'updates' },
      }))
    })
    expect(setShowSettings).toHaveBeenCalledWith(true)
    expect(result.current.notice).toBeNull()
    window.removeEventListener('psm-settings:navigate', navigate)
  })
})
