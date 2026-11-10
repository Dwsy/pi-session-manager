import type { MeshPeer } from './meshHelpers'
import { isFavoritePeer, meshRepoKey } from './meshHelpers'
import type { MeshFilter } from './meshStore'

export type MeshDisplayStatus = 'running' | 'idle' | 'offline'
export type MeshTranslate = (key: string, fallback: string) => string

export function meshDisplayStatus(peer: MeshPeer, available: boolean): MeshDisplayStatus {
  return available && (peer.status === 'running' || peer.status === 'idle') ? peer.status : 'offline'
}

export function matchesMeshQuery(peer: MeshPeer, query: string): boolean {
  const value = query.trim().toLocaleLowerCase()
  return !value || [peer.title, peer.cwd, peer.repoName, peer.branch, peer.mesh?.sessionId, peer.mesh?.model]
    .some((item) => item?.toLocaleLowerCase().includes(value))
}

export function meshFilterCounts(peers: MeshPeer[], available: boolean, favoriteIds: Set<string>) {
  const counts: Record<MeshFilter, number> = { all: peers.length, online: 0, running: 0, idle: 0, offline: 0, favorites: 0 }
  for (const peer of peers) {
    const status = meshDisplayStatus(peer, available)
    counts[status]++
    if (status !== 'offline') counts.online++
    if (isFavoritePeer(peer, favoriteIds)) counts.favorites++
  }
  return counts
}

export function filterMeshPeers(peers: MeshPeer[], options: {
  query: string; repo: string | null; filter: MeshFilter; available: boolean; favoriteIds: Set<string>
}) {
  return peers.filter((peer) => {
    if (options.repo && meshRepoKey(peer) !== options.repo) return false
    if (!matchesMeshQuery(peer, options.query)) return false
    const status = meshDisplayStatus(peer, options.available)
    if (options.filter === 'online') return status !== 'offline'
    if (options.filter === 'favorites') return isFavoritePeer(peer, options.favoriteIds)
    return options.filter === 'all' || status === options.filter
  })
}

export function meshFilterLabel(filter: MeshFilter, t: MeshTranslate): string {
  const labels: Record<MeshFilter, string> = { all: '全部', online: '在线', running: '运行中', idle: '空闲', favorites: '收藏', offline: '离线' }
  return t(filter, labels[filter])
}

export function meshActivityTimestamp(peer: MeshPeer): string {
  return peer.lastFile?.ts || peer.session?.modified || peer.mesh?.startedAt || ''
}

export function meshRelativeTime(timestamp: string, t: MeshTranslate): string {
  const time = new Date(timestamp).getTime()
  if (!timestamp || !Number.isFinite(time)) return t('historyRecord', '历史记录')
  const seconds = Math.max(0, (Date.now() - time) / 1000)
  if (seconds < 60) return t('justNow', '刚刚')
  const language = typeof document !== 'undefined' ? document.documentElement.lang : undefined
  const formatter = new Intl.RelativeTimeFormat(language || undefined, { numeric: 'auto', style: 'short' })
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), 'minute')
  if (seconds < 86400) return formatter.format(-Math.floor(seconds / 3600), 'hour')
  if (seconds < 604800) return formatter.format(-Math.floor(seconds / 86400), 'day')
  return new Date(time).toLocaleDateString(language || undefined, { month: 'short', day: 'numeric' })
}
