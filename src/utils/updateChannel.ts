import updateChannels from '@/runtime-data/update-channels.json'

export type UpdateChannel = 'stable' | 'beta'

type UpdateChannelConfig = {
  owner: string
  repo: string
  manifestBranch: string
  channels: Record<UpdateChannel, { manifestPath: string }>
}

const config = updateChannels as UpdateChannelConfig

export function getGithubRepoSlug(): string {
  return `${config.owner}/${config.repo}`
}

export function getGithubLatestReleaseApiUrl(): string {
  return `https://api.github.com/repos/${getGithubRepoSlug()}/releases/latest`
}

const JSP_PROXY_PREFIX_B64 =
  'aHR0cHM6Ly9qc3AuZHdzeS5saW5rL2h0dHAvaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy8='
const JSP_PROXY_REFERER_PREFIX_B64 = 'aHR0cHM6Ly9qc3AuZHdzeS5saW5rLz8='
const JSP_PROXY_VERSION = '110'

function decodeBase64(value: string): string {
  return atob(value)
}

function getGithubProxyReferer(params: Record<string, string>): string {
  return `${decodeBase64(JSP_PROXY_REFERER_PREFIX_B64)}${new URLSearchParams(params).toString()}`
}

function getGithubProxyApiUrl(targetUrl: string): string {
  const githubPath = targetUrl.replace('https://api.github.com/repos/', '')
  return `${decodeBase64(JSP_PROXY_PREFIX_B64)}${githubPath}`
}

export function getGithubProxyRequestHeaders(): HeadersInit {
  return {
    Referer: getGithubProxyReferer({
      '--ver': JSP_PROXY_VERSION,
      '--mode': 'cors',
      '--type': '',
      '--aceh': '1',
      '--level': '1',
    }),
  }
}

export function getGithubLatestReleaseProxyApiUrl(): string {
  return getGithubProxyApiUrl(getGithubLatestReleaseApiUrl())
}

export function getGithubReleasesApiUrl(perPage = 20): string {
  return `https://api.github.com/repos/${getGithubRepoSlug()}/releases?per_page=${perPage}`
}

export function getGithubReleasesProxyApiUrl(perPage = 20): string {
  return getGithubProxyApiUrl(getGithubReleasesApiUrl(perPage))
}

export function normalizeUpdateChannel(value: string | null | undefined): UpdateChannel {
  return value === 'beta' ? 'beta' : 'stable'
}

export function getChannelManifestPath(channel: UpdateChannel): string {
  return config.channels[channel].manifestPath
}

export function getChannelManifestUrls(channel: UpdateChannel): string[] {
  const path = getChannelManifestPath(channel)
  return [
    `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.manifestBranch}/${path}`,
    `https://cdn.jsdelivr.net/gh/${config.owner}/${config.repo}@${config.manifestBranch}/${path}`,
  ]
}

export function getReleaseTag(version: string): string {
  const normalized = version.trim().replace(/^v/i, '')
  return `v${normalized}`
}

export function getReleaseUrl(version: string): string {
  return `https://github.com/${config.owner}/${config.repo}/releases/tag/${getReleaseTag(version)}`
}

export function getReleasesPageUrl(): string {
  return `https://github.com/${config.owner}/${config.repo}/releases`
}
