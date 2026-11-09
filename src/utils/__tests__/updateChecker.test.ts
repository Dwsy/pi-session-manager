import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { compareVersions, checkForUpdates } from '../updateChecker'

describe('compareVersions', () => {
  it('compares major versions', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1)
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
  })

  it('compares minor versions', () => {
    expect(compareVersions('1.2.0', '1.1.0')).toBe(1)
    expect(compareVersions('1.1.0', '1.2.0')).toBe(-1)
  })

  it('compares patch versions', () => {
    expect(compareVersions('1.0.2', '1.0.1')).toBe(1)
    expect(compareVersions('1.0.1', '1.0.2')).toBe(-1)
  })

  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('handles versions with v prefix', () => {
    expect(compareVersions('v2.0.0', 'v1.0.0')).toBe(1)
  })

  it('handles prerelease versions', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0-alpha.1')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0-beta.1')).toBe(1)
  })
})

describe('checkForUpdates - fallback logic', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns latest status when no update available', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tag_name: 'v1.0.0', prerelease: false, draft: false }),
    })

    const result = await checkForUpdates('stable', '1.0.0')
    expect(result.status).toBe('latest')
  })

  it('returns update status when newer version available', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tag_name: 'v2.0.0', prerelease: false, draft: false }),
    })

    const result = await checkForUpdates('stable', '1.0.0')
    expect(result.status).toBe('update')
  })

  it('returns error when manifest and GitHub API fail', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })

    const result = await checkForUpdates('stable', '1.0.0')
    expect(result.status).toBe('error')
  })

  it('handles beta channel fallback', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/latest.json')) {
        return Promise.resolve({ ok: false, status: 404 })
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve([
            { tag_name: 'v1.5.0-beta.1', prerelease: true, draft: false },
            { tag_name: 'v1.0.0', prerelease: false, draft: false },
          ]),
      })
    })

    const result = await checkForUpdates('beta', '1.0.0')
    expect(result.status).toBe('update')
    if (result.status === 'update') {
      expect(result.update.latestVersion).toBe('1.5.0-beta.1')
    }
  })
})
