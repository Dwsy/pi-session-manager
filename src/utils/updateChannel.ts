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

const JSP_PROXY_ORIGIN = 'https://jsp.dwsy.link'
const JSP_PROXY_VERSION = '110'

function getGithubProxyReferer(params: Record<string, string>): string {
  return `${JSP_PROXY_ORIGIN}/?${new URLSearchParams(params).toString()}`
}

function getGithubProxyApiUrl(targetUrl: string): string {
  return `${JSP_PROXY_ORIGIN}/http/${targetUrl}`
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
