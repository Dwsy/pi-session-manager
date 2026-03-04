const GITHUB_RELEASE_API_URL =
  'https://api.github.com/repos/Dwsy/pi-session-manager/releases/latest'
const GITHUB_RELEASE_PAGE_URL =
  'https://github.com/Dwsy/pi-session-manager/releases/latest'
const LAST_CHECK_AT_KEY = 'psm.update.lastCheckAt'
const DISMISSED_VERSION_KEY = 'psm.update.dismissedVersion'
const ONE_DAY_MS = 24 * 60 * 60 * 1000

interface GithubRelease {
  tag_name: string
  html_url?: string
  name?: string
  body?: string
  published_at?: string
}

interface NormalizedVersion {
  core: number[]
  prerelease: string[]
}

export interface AvailableUpdateInfo {
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

async function fetchLatestRelease(): Promise<GithubRelease> {
  const response = await fetch(GITHUB_RELEASE_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }

  const payload = (await response.json()) as Partial<GithubRelease>
  if (!payload.tag_name) {
    throw new Error('Missing tag_name in GitHub release payload')
  }

  return {
    tag_name: payload.tag_name,
    html_url: payload.html_url,
    name: payload.name,
    body: payload.body,
    published_at: payload.published_at,
  }
}

export function getCurrentAppVersion(): string {
  if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim().length > 0) {
    return normalizeVersion(__APP_VERSION__)
  }
  return '0.0.0'
}

export function getLastUpdateCheckAt(): string | null {
  try {
    return localStorage.getItem(LAST_CHECK_AT_KEY)
  } catch {
    return null
  }
}

function setLastUpdateCheckAt(value: string): void {
  try {
    localStorage.setItem(LAST_CHECK_AT_KEY, value)
  } catch {
    // Ignore localStorage errors.
  }
}

export function shouldRunDailyUpdateCheck(now: number = Date.now()): boolean {
  const lastCheckAt = getLastUpdateCheckAt()
  if (!lastCheckAt) return true
  const lastTime = new Date(lastCheckAt).getTime()
  if (Number.isNaN(lastTime)) return true
  return now - lastTime >= ONE_DAY_MS
}

export function getDismissedUpdateVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_VERSION_KEY)
  } catch {
    return null
  }
}

export function dismissUpdateVersion(version: string): void {
  try {
    localStorage.setItem(DISMISSED_VERSION_KEY, normalizeVersion(version))
  } catch {
    // Ignore localStorage errors.
  }
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const checkedAt = new Date().toISOString()
  try {
    const [currentVersion, latestRelease] = await Promise.all([
      Promise.resolve(getCurrentAppVersion()),
      fetchLatestRelease(),
    ])

    const latestVersion = normalizeVersion(latestRelease.tag_name)
    if (compareVersions(latestVersion, currentVersion) > 0) {
      return {
        status: 'update',
        checkedAt,
        update: {
          currentVersion,
          latestVersion,
          releaseUrl: latestRelease.html_url || GITHUB_RELEASE_PAGE_URL,
          releaseName:
            latestRelease.name || `v${latestRelease.tag_name.replace(/^v/i, '')}`,
          releaseNotes: trimReleaseNotes(latestRelease.body),
          releaseNotesMarkdown: latestRelease.body || '',
          publishedAt: latestRelease.published_at || null,
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
    setLastUpdateCheckAt(checkedAt)
  }
}
