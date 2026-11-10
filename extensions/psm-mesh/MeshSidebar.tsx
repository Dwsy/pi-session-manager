import { useCallback, useMemo, useState } from 'react'
import { Activity, ChevronRight, FolderGit2, Folders, Network, RefreshCw, Search, X } from 'lucide-react'
import type { PsmPluginHostContext } from '@dwsy/plugin-sdk'
import type { AppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'
import {
  AppPluginSidebarBody, AppPluginSidebarControls, AppPluginSidebarFooter,
  AppPluginSidebarHeader, AppPluginSidebarShell, AppPluginSidebarState,
  appPluginSidebarIconButtonClass,
} from '@/components/app/AppPluginSidebarShell'
import { basenameForDisplay, favoriteIdsFromItems, mergeMeshPeers, meshRepoKey } from './meshHelpers'
import { matchesMeshQuery, meshFilterCounts, meshFilterLabel, meshRelativeTime } from './meshUi'
import { type MeshFilter, type MeshStore, useMeshSnapshot } from './meshStore'
import './mesh.less'

export interface MeshSidebarProps {
  ctx: PsmPluginHostContext
  data?: AppPluginSurfaceData
  active: boolean
  meshStore: MeshStore
}

export default function MeshSidebar({ ctx, data, meshStore }: MeshSidebarProps) {
  const t = useCallback((key: string, fallback: string) => ctx.i18n.t(`plugins.psmMesh.${key}`, fallback), [ctx])
  const snapshot = useMeshSnapshot(meshStore)
  const [repoQuery, setRepoQuery] = useState('')
  const peers = useMemo(() => mergeMeshPeers(data?.sessions ?? [], snapshot.meshAgents), [data?.sessions, snapshot.meshAgents])
  const favoriteIds = useMemo(() => favoriteIdsFromItems(snapshot.favorites), [snapshot.favorites])
  const repoGroups = useMemo(() => {
    const groups = new Map<string, { key: string; name: string; total: number; online: number }>()
    for (const peer of peers) {
      const key = meshRepoKey(peer)
      const group = groups.get(key) ?? { key, name: peer.repoName, total: 0, online: 0 }
      group.total++
      if (snapshot.meshAvailable && (peer.status === 'running' || peer.status === 'idle')) group.online++
      groups.set(key, group)
    }
    return [...groups.values()].sort((a, b) => b.online - a.online || b.total - a.total || a.key.localeCompare(b.key))
  }, [peers, snapshot.meshAvailable])
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>()
    for (const group of repoGroups) counts.set(group.name, (counts.get(group.name) ?? 0) + 1)
    return counts
  }, [repoGroups])
  const filterCounts = useMemo(() => meshFilterCounts(peers.filter((peer) =>
    (!snapshot.selectedRepo || meshRepoKey(peer) === snapshot.selectedRepo) && matchesMeshQuery(peer, snapshot.query),
  ), snapshot.meshAvailable, favoriteIds), [peers, snapshot.selectedRepo, snapshot.query, snapshot.meshAvailable, favoriteIds])
  const filters: MeshFilter[] = ['all', 'online', 'running', 'idle', 'favorites', 'offline']
  const query = repoQuery.trim().toLocaleLowerCase()
  const visibleGroups = repoGroups.filter((group) => !query || group.key.toLocaleLowerCase().includes(query) || group.name.toLocaleLowerCase().includes(query))

  return (
    <AppPluginSidebarShell label="PSM Mesh" className="mesh-sidebar">
      <AppPluginSidebarHeader icon={<Network className="h-4 w-4" />} title={t('title', 'Mesh')}
        subtitle={`${snapshot.onlineCount} ${t('online', '在线')} · ${snapshot.runningCount} ${t('running', '运行中')}`}
        actions={<button type="button" onClick={() => void meshStore.refresh()} disabled={snapshot.refreshing || snapshot.loading}
          className={`${appPluginSidebarIconButtonClass} disabled:opacity-50`} title={t('refresh', '刷新')} aria-label={t('refresh', '刷新')}>
          <RefreshCw className={`h-3.5 w-3.5 ${snapshot.refreshing ? 'animate-spin' : ''}`} /></button>} />
      <AppPluginSidebarControls>
        <div className="mesh-sidebar__connection" data-offline={!snapshot.meshAvailable} title={snapshot.error ?? undefined}>
          <span className="mesh-sidebar__connection-dot" />
          <span>{snapshot.loading ? t('connecting', '正在连接…') : snapshot.meshAvailable ? t('hubConnected', 'Mesh Hub 已连接') : t('hubOffline', 'Mesh Hub 离线')}</span>
          <span>{t('autoSync', '自动同步')}</span>
        </div>
        <div role="group" aria-label={t('statusFilter', '会话状态')} className="mesh-sidebar__filters">
          {filters.map((filter) => <button key={filter} type="button" aria-pressed={snapshot.filter === filter}
            onClick={() => meshStore.setFilter(filter)} className="mesh-sidebar__filter">
            <span>{meshFilterLabel(filter, t)}</span><span>{filterCounts[filter]}</span>
          </button>)}
        </div>
        <div className="mesh-sidebar__section-title"><FolderGit2 className="h-3 w-3" />
          <span>{t('repositories', '工作区与代码仓库')}</span><span>{visibleGroups.length} / {repoGroups.length}</span>
        </div>
        <div className="mesh-search">
          <Search className="h-3 w-3" />
          <input value={repoQuery} onChange={(event) => setRepoQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape' && repoQuery) { event.stopPropagation(); setRepoQuery('') } }}
            aria-label={t('searchRepos', '搜索代码仓库')} placeholder={t('searchRepos', '搜索代码仓库')} />
          {repoQuery && <button type="button" className="mesh-icon-button" aria-label={t('clearRepoSearch', '清除仓库搜索')} onClick={() => setRepoQuery('')}><X className="h-3.5 w-3.5" /></button>}
        </div>
        <button type="button" onClick={() => meshStore.setSelectedRepo(null)} aria-pressed={snapshot.selectedRepo === null} className="mesh-repo">
          <Folders className="h-3.5 w-3.5 shrink-0" /><span className="mesh-repo__name">{t('allRepos', '全部代码仓库')}</span>
          <span className="mesh-repo__total" title={t('allSessionCount', '全部会话数')}>{peers.length}</span>
        </button>
        {snapshot.selectedRepo && <button type="button" className="mesh-sidebar__clear" title={snapshot.selectedRepo} onClick={() => meshStore.setSelectedRepo(null)}>
          <span>{basenameForDisplay(snapshot.selectedRepo)}</span><X className="h-3 w-3" />
        </button>}
      </AppPluginSidebarControls>
      <AppPluginSidebarBody className="px-2 pb-2" aria-label={t('repoList', '代码仓库列表')}>
        {visibleGroups.length === 0 && <AppPluginSidebarState>
          <div className="flex flex-col items-center gap-2 py-4"><Search className="h-4 w-4 opacity-60" />
            <span>{snapshot.loading ? t('loading', '加载中…') : t('noRepos', '没有匹配的代码仓库')}</span>
            {repoQuery && <button type="button" className="mesh-button" onClick={() => setRepoQuery('')}>{t('showAllRepos', '显示全部仓库')}</button>}
          </div>
        </AppPluginSidebarState>}
        {visibleGroups.map((group) => <button key={group.key} type="button" title={group.key}
          aria-pressed={snapshot.selectedRepo === group.key} className="mesh-repo"
          onClick={() => meshStore.setSelectedRepo(snapshot.selectedRepo === group.key ? null : group.key)}>
          <FolderGit2 className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="mesh-repo__name"><span>{group.name}</span>
            {(duplicateNames.get(group.name) ?? 0) > 1 && <small>{group.key.replace(/\\/g, '/').split('/').filter(Boolean).slice(-3, -1).join('/')}</small>}
          </span>
          {group.online > 0 && <span className="mesh-repo__live"><span className="h-1 w-1 rounded-full bg-current" />{group.online} {t('online', '在线')}</span>}
          <span className="mesh-repo__total" title={t('allSessionCount', '全部会话数')}>{group.total}</span>
        </button>)}
      </AppPluginSidebarBody>
      <AppPluginSidebarFooter>
        <details className="mesh-sidebar__activity">
          <summary><ChevronRight className="h-3 w-3" /><Activity className="h-3 w-3" /><span>{t('recentActivity', '实时文件变动')}</span><span>{snapshot.activity.length}</span></summary>
          <div className="mesh-sidebar__activity-list">
            {snapshot.activity.length === 0 && <p className="py-3 text-[10px] text-muted-foreground">{t('noRecentActivity', '暂无文件变动')}</p>}
            {snapshot.activity.map((item) => <div key={item.id} className="mesh-sidebar__activity-item" title={item.sessionPath}>
              <div>{item.label}</div><small>{peers.find((peer) => peer.session?.path === item.sessionPath || peer.mesh?.sessionFile === item.sessionPath)?.title || t('onlineMeshAgent', 'Mesh 会话')} · {meshRelativeTime(item.timestamp, t)}</small>
            </div>)}
          </div>
        </details>
      </AppPluginSidebarFooter>
    </AppPluginSidebarShell>
  )
}
