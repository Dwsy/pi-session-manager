import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage.set(key, value)
  }),
  removeItem: vi.fn((key: string) => {
    storage.delete(key)
  }),
  clear: vi.fn(() => {
    storage.clear()
  }),
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
})

describe('updateChecker', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    localStorage.clear()
    Object.defineProperty(globalThis, 'fetch', {
      value: vi.fn(),
      configurable: true,
    })
  })

  it('compares prerelease versions correctly', async () => {
    const { compareVersions } = await import('./updateChecker')

    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBe(1)
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.1')).toBe(1)
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1)
  })

  it('checks stable channel against GitHub latest release and stores channel-specific timestamp', async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tag_name: 'v0.6.4',
        html_url: 'https://github.com/Dwsy/pi-session-manager/releases/tag/v0.6.4',
        name: 'Pi Session Manager 0.6.4',
        body: 'Stable notes',
        published_at: '2026-05-26T00:00:00Z',
        prerelease: false,
        draft: false,
      }),
    } as Response)

    const { checkForUpdates, getLastUpdateCheckAt } = await import('./updateChecker')

    const result = await checkForUpdates('stable', '0.6.3')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/releases/latest'),
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }),
      }),
    )
    expect(result.status).toBe('update')
    if (result.status === 'update') {
      expect(result.update.latestVersion).toBe('0.6.4')
      expect(result.update.releaseUrl).toBe('https://github.com/Dwsy/pi-session-manager/releases/tag/v0.6.4')
      expect(result.update.releaseName).toBe('Pi Session Manager 0.6.4')
    }
    expect(getLastUpdateCheckAt('stable')).not.toBeNull()
    expect(getLastUpdateCheckAt('beta')).toBeNull()
  })

  it('checks beta channel against GitHub prerelease list and keeps dismissed versions isolated per channel', async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        {
          tag_name: 'v0.7.0-beta.2',
          html_url: 'https://github.com/Dwsy/pi-session-manager/releases/tag/v0.7.0-beta.2',
          name: 'Pi Session Manager 0.7.0-beta.2',
          body: 'Beta notes',
          published_at: '2026-05-26T00:00:00Z',
          prerelease: true,
          draft: false,
        },
        {
          tag_name: 'v0.6.4',
          html_url: 'https://github.com/Dwsy/pi-session-manager/releases/tag/v0.6.4',
          name: 'Pi Session Manager 0.6.4',
          body: 'Stable notes',
          published_at: '2026-05-20T00:00:00Z',
          prerelease: false,
          draft: false,
        },
      ]),
    } as Response)

    const {
      checkForUpdates,
      dismissUpdateVersion,
      getDismissedUpdateVersion,
    } = await import('./updateChecker')

    dismissUpdateVersion('stable', '0.6.4')
    dismissUpdateVersion('beta', '0.7.0-beta.1')

    const result = await checkForUpdates('beta', '0.7.0-beta.1')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/releases?per_page=20'),
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }),
      }),
    )
    expect(result.status).toBe('update')
    if (result.status === 'update') {
      expect(result.update.latestVersion).toBe('0.7.0-beta.2')
      expect(result.update.releaseUrl).toBe('https://github.com/Dwsy/pi-session-manager/releases/tag/v0.7.0-beta.2')
    }
    expect(getDismissedUpdateVersion('stable')).toBe('0.6.4')
    expect(getDismissedUpdateVersion('beta')).toBe('0.7.0-beta.1')
  })
})
