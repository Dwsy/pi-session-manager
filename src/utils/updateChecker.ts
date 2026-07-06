import {
  getGithubLatestReleaseApiUrl,
  getGithubLatestReleaseProxyApiUrl,
  getGithubProxyRequestHeaders,
  getGithubReleasesApiUrl,
  getGithubReleasesProxyApiUrl,
  getReleaseUrl,
  normalizeUpdateChannel,
  type UpdateChannel,
} from './updateChannel'

const LAST_CHECK_AT_KEY = 'psm.update.lastCheckAt'
const DISMISSED_VERSION_KEY = 'psm.update.dismissedVersion'
const ONE_DAY_MS = 24 * 60 * 60 * 1000

interface GithubRelease {
  tag_name?: string
  html_url?: string
  name?: string
  body?: string
  published_at?: string
  prerelease?: boolean
  draft?: boolean
}

interface NormalizedVersion {
  core: number[]
  prerelease: string[]
}

export interface AvailableUpdateInfo {
  channel: UpdateChannel
  currentVersion: string
  latestVersion: string
  releaseUrl: string
  releaseName: string
  releaseNotes: string
  releaseNotesMarkdown: string
  publishedAt: string | null
}

export type UpdateCheckResult =
  | {
      status: 'update'
      checkedAt: string
      update: AvailableUpdateInfo
    }
  | {
      status: 'latest'
      checkedAt: string
      currentVersion: string
      latestVersion: string
    }
  | {
      status: 'error'
      checkedAt: string
      errorMessage: string
    }

function channelStorageKey(prefix: string, channel: UpdateChannel) {
  return `${prefix}:${channel}`
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

function parseCorePart(value: string): number {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : 0
}

function splitVersion(value: string): NormalizedVersion {
  const normalized = normalizeVersion(value)
  const [coreRaw, prereleaseRaw] = normalized.split('-', 2)
  const coreParts = coreRaw
    .split('.')
    .filter(Boolean)
    .map(parseCorePart)
  while (coreParts.length < 3) {
    coreParts.push(0)
  }

  const prerelease = prereleaseRaw
    ? prereleaseRaw.split('.').filter(Boolean)
    : []

  return {
    core: coreParts.slice(0, 3),
    prerelease,
  }
}

function comparePrerelease(left: string[], right: string[]): number {
  const maxLen = Math.max(left.length, right.length)
  for (let i = 0; i < maxLen; i += 1) {
    const l = left[i]
    const r = right[i]
    if (l === undefined) return -1
    if (r === undefined) return 1

    const lNum = Number.parseInt(l, 10)
    const rNum = Number.parseInt(r, 10)
    const lIsNum = Number.isFinite(lNum) && String(lNum) === l
    const rIsNum = Number.isFinite(rNum) && String(rNum) === r

    if (lIsNum && rIsNum) {
      if (lNum !== rNum) return lNum > rNum ? 1 : -1
      continue
    }

    if (lIsNum && !rIsNum) return -1
    if (!lIsNum && rIsNum) return 1

    if (l !== r) return l > r ? 1 : -1
  }
  return 0
}

export function compareVersions(left: string, right: string): number {
  const l = splitVersion(left)
  const r = splitVersion(right)

  for (let i = 0; i < 3; i += 1) {
    if (l.core[i] !== r.core[i]) {
      return l.core[i] > r.core[i] ? 1 : -1
    }
  }

  if (l.prerelease.length === 0 && r.prerelease.length === 0) return 0
  if (l.prerelease.length === 0) return 1
  if (r.prerelease.length === 0) return -1
  return comparePrerelease(l.prerelease, r.prerelease)
}

function trimReleaseNotes(value?: string): string {
  if (!value) return ''
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
}

function isValidRelease(value: Partial<GithubRelease> | null | undefined): value is GithubRelease & { tag_name: string } {
  return Boolean(value && value.tag_name && !value.draft)
}

function isPreferredBetaRelease(release: GithubRelease): boolean {
  return release.prerelease === true
}

async function fetchJson<T>(url: string): Promise<T> {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
  }

  if (url.startsWith('https://jsp.dwsy.link/')) {
    Object.assign(headers as Record<string, string>, getGithubProxyRequestHeaders())
  }

  const response = await fetch(url, {
    headers,
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }

  return response.json() as Promise<T>
}

async function fetchStableRelease(): Promise<GithubRelease & { tag_name: string }> {
  try {
    const payload = await fetchJson<Partial<GithubRelease>>(getGithubLatestReleaseApiUrl())
    if (!isValidRelease(payload)) {
      throw new Error('Missing tag_name in GitHub latest release payload')
    }
    return payload
  } catch (error) {
    const payload = await fetchJson<Partial<GithubRelease>>(getGithubLatestReleaseProxyApiUrl())
    if (!isValidRelease(payload)) {
      throw new Error('Missing tag_name in GitHub latest release proxy payload')
    }
    return payload
  }
}

async function fetchBetaRelease(): Promise<GithubRelease & { tag_name: string }> {
  try {
    const releases = await fetchJson<Array<Partial<GithubRelease>>>(getGithubReleasesApiUrl())
    const validReleases = releases.filter(isValidRelease)
    const preferred = validReleases.find(isPreferredBetaRelease)
    const fallback = validReleases.find((release) => !release.prerelease)
    const chosen = preferred ?? fallback
    if (!chosen) {
      throw new Error('No GitHub releases available for beta channel')
    }
    return chosen
  } catch (error) {
    const releases = await fetchJson<Array<Partial<GithubRelease>>>(getGithubReleasesProxyApiUrl())
    const validReleases = releases.filter(isValidRelease)
    const preferred = validReleases.find(isPreferredBetaRelease)
    const fallback = validReleases.find((release) => !release.prerelease)
    const chosen = preferred ?? fallback
    if (!chosen) {
      throw new Error('No GitHub releases available for beta channel proxy')
    }
    return chosen
  }
}

async function fetchReleaseForChannel(channel: UpdateChannel): Promise<GithubRelease & { tag_name: string }> {
  return channel === 'beta' ? fetchBetaRelease() : fetchStableRelease()
}

export function getCurrentAppVersion(): string {
  if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim().length > 0) {
    return normalizeVersion(__APP_VERSION__)
  }
  return '0.0.0'
}

export function getLastUpdateCheckAt(channelInput: UpdateChannel | string = 'stable'): string | null {
  const channel = normalizeUpdateChannel(channelInput)
  try {
    return localStorage.getItem(channelStorageKey(LAST_CHECK_AT_KEY, channel))
  } catch {
    return null
  }
}

export function setLastUpdateCheckAt(channelInput: UpdateChannel | string = 'stable', value: string): void {
  const channel = normalizeUpdateChannel(channelInput)
  try {
    localStorage.setItem(channelStorageKey(LAST_CHECK_AT_KEY, channel), value)
  } catch {
    // Ignore localStorage errors.
  }
}

export function shouldRunDailyUpdateCheck(channelInput: UpdateChannel | string = 'stable', now: number = Date.now()): boolean {
  const lastCheckAt = getLastUpdateCheckAt(channelInput)
  if (!lastCheckAt) return true
  const lastTime = new Date(lastCheckAt).getTime()
  if (Number.isNaN(lastTime)) return true
  return now - lastTime >= ONE_DAY_MS
}

export function getDismissedUpdateVersion(channelInput: UpdateChannel | string = 'stable'): string | null {
  const channel = normalizeUpdateChannel(channelInput)
  try {
    return localStorage.getItem(channelStorageKey(DISMISSED_VERSION_KEY, channel))
  } catch {
    return null
  }
}

export function dismissUpdateVersion(channelInput: UpdateChannel | string = 'stable', version: string): void {
  const channel = normalizeUpdateChannel(channelInput)
  try {
    localStorage.setItem(channelStorageKey(DISMISSED_VERSION_KEY, channel), normalizeVersion(version))
  } catch {
    // Ignore localStorage errors.
  }
}

export async function checkForUpdates(
  channelInput: UpdateChannel | string = 'stable',
  currentVersion = getCurrentAppVersion(),
): Promise<UpdateCheckResult> {
  const channel = normalizeUpdateChannel(channelInput)
  const checkedAt = new Date().toISOString()
  try {
    const release = await fetchReleaseForChannel(channel)
    const latestVersion = normalizeVersion(release.tag_name)
    if (compareVersions(latestVersion, currentVersion) > 0) {
      return {
        status: 'update',
        checkedAt,
        update: {
          channel,
          currentVersion,
          latestVersion,
          releaseUrl: release.html_url || getReleaseUrl(latestVersion),
          releaseName: release.name || `Pi Session Manager v${latestVersion}`,
          releaseNotes: trimReleaseNotes(release.body),
          releaseNotesMarkdown: release.body || '',
          publishedAt: release.published_at || null,
        },
      }
    }

    return {
      status: 'latest',
      checkedAt,
      currentVersion,
      latestVersion,
    }
  } catch (error) {
    return {
      status: 'error',
      checkedAt,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    }
  } finally {
    setLastUpdateCheckAt(channel, checkedAt)
  }
}
