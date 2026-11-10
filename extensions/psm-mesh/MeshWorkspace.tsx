import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, Archive, ChevronDown, ChevronRight, Columns3, Folder, Info, Loader2,
  MessageSquare, MoreHorizontal, Network, PauseCircle, Plus, RefreshCw, Search, Send, Table, Terminal, X,
} from 'lucide-react'
import type { PsmPluginHostContext } from '@dwsy/plugin-sdk'
import type { AppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'
import type { SessionInfo } from '@/types'
import SessionPreviewModal from '@/components/session-preview/SessionPreviewModal'
import { getSessionSourceSlug } from '@/utils/session'
import {
  basenameForDisplay, favoriteIdsFromItems, isFavoritePeer, mergeMeshPeers, meshRepoKey,
  MESH_PEER_PAGE_SIZE, normalizePiSessionId, pageMeshPeers, type MeshPeer,
} from './meshHelpers'
import { createMeshStore, type MeshStore, type MeshFilter, useMeshSnapshot } from './meshStore'
import {
  filterMeshPeers, matchesMeshQuery, meshActivityTimestamp, meshDisplayStatus,
  meshFilterCounts, meshFilterLabel, meshRelativeTime,
} from './meshUi'
import MeshPeerCard from './MeshPeerCard'
import MeshTopologyView from './MeshTopologyView'
import MeshMessageDialog from './MeshMessageDialog'
import MeshSessionMenu from './MeshSessionMenu'
import './mesh.less'

export interface MeshWorkspaceProps {
  ctx: PsmPluginHostContext
  data?: AppPluginSurfaceData
  active: boolean
  fullPage?: boolean
  meshStore?: MeshStore
}

export default function MeshWorkspace({
  ctx,
  data,
  active: _active,
  fullPage: _fullPage = true,
  meshStore: externalStore,
}: MeshWorkspaceProps) {
  const t = useCallback(
    (key: string, fallback: string) => ctx.i18n.t(`plugins.psmMesh.${key}`, fallback),
    [ctx],
  )

  const internalStoreRef = useRef<MeshStore | null>(null)
  if (!externalStore && !internalStoreRef.current) {
    internalStoreRef.current = createMeshStore(ctx)
  }
  const store = externalStore ?? internalStoreRef.current!

  useEffect(() => {
    return () => {
      if (internalStoreRef.current) {
        internalStoreRef.current.dispose()
        internalStoreRef.current = null
      }
    }
  }, [])

  const snapshot = useMeshSnapshot(store)
  const [visiblePeerLimit, setVisiblePeerLimit] = useState(MESH_PEER_PAGE_SIZE)
  const [previewSession, setPreviewSession] = useState<SessionInfo | null>(null)
  const [messagePeer, setMessagePeer] = useState<MeshPeer | null>(null)
  const [contextMenu, setContextMenu] = useState<{ peer: MeshPeer; session: SessionInfo; point: { x: number; y: number } } | null>(null)
  const [focusing, setFocusing] = useState<string | null>(null)

  const peers = useMemo(
    () => mergeMeshPeers(data?.sessions ?? [], snapshot.meshAgents),
    [data?.sessions, snapshot.meshAgents],
  )

  const favoriteIds = useMemo(
    () => favoriteIdsFromItems(snapshot.favorites),
    [snapshot.favorites],
  )

  const filteredPeers = useMemo(() => filterMeshPeers(peers, {
    query: snapshot.query, repo: snapshot.selectedRepo, filter: snapshot.filter,
    available: snapshot.meshAvailable, favoriteIds,
  }), [peers, snapshot.query, snapshot.selectedRepo, snapshot.filter, snapshot.meshAvailable, favoriteIds])

  const filterCounts = useMemo(() => meshFilterCounts(peers.filter((peer) =>
    (!snapshot.selectedRepo || meshRepoKey(peer) === snapshot.selectedRepo) && matchesMeshQuery(peer, snapshot.query),
  ), snapshot.meshAvailable, favoriteIds), [peers, snapshot.selectedRepo, snapshot.query, snapshot.meshAvailable, favoriteIds])

  useEffect(() => { setVisiblePeerLimit(MESH_PEER_PAGE_SIZE) }, [snapshot.filter, snapshot.query, snapshot.selectedRepo])
  const visiblePeers = pageMeshPeers(filteredPeers, visiblePeerLimit)
  const lanes = (['running', 'idle', 'offline'] as const).map((status) => {
    const items = filteredPeers.filter((peer) => meshDisplayStatus(peer, snapshot.meshAvailable) === status)
    return { status, items, visible: pageMeshPeers(items, visiblePeerLimit) }
  }).filter((lane) => lane.items.length > 0 || (
    lane.status !== 'offline' && !snapshot.query.trim() && (snapshot.filter === 'online' || snapshot.filter === 'all')
  ))
  const shownCount = snapshot.viewMode === 'board'
    ? lanes.reduce((count, lane) => count + lane.visible.length, 0)
    : snapshot.viewMode === 'topology' ? filteredPeers.length : visiblePeers.length
  const hasFilters = snapshot.filter !== 'online' || !!snapshot.query || !!snapshot.selectedRepo
  const resetFilters = () => { store.setFilter('online'); store.setQuery(''); store.setSelectedRepo(null) }
  const newSessionCwd = snapshot.selectedRepo || snapshot.previewPeer?.cwd || peers.find((peer) => peer.cwd)?.cwd || ''

  const resolveSession = async (peer: MeshPeer): Promise<SessionInfo | null> => {
    store.setActionError(null)

    if (peer.session) {
      return peer.session
    }

    const mesh = peer.mesh
    if (!mesh || peer.isEphemeral || !mesh.sessionFile) {
      return null
    }

    try {
      const resolved = await ctx.psm.sessions.lookupByPath(mesh.sessionFile)
      if (typeof resolved === 'object' && resolved !== null) {
        const candidate = resolved as Partial<SessionInfo>
        if (
          normalizePiSessionId(mesh.sessionId)
          && candidate.path === mesh.sessionFile
          && normalizePiSessionId(candidate.id) === normalizePiSessionId(mesh.sessionId)
          && getSessionSourceSlug(candidate.path) === 'pi'
        ) {
          return candidate as SessionInfo
        }
      }
    } catch (lookupError) {
      store.setActionError(lookupError instanceof Error ? lookupError.message : String(lookupError))
    }
    return null
  }

  const canControl = (peer: MeshPeer) => {
    const id = normalizePiSessionId(peer.mesh?.sessionId)
    return snapshot.meshAvailable && !!id && (peer.status === 'running' || peer.status === 'idle')
      && snapshot.meshAgents.filter((p) => normalizePiSessionId(p.sessionId) === id).length === 1
  }
  const herdrHost = (peer: MeshPeer) => {
    const path = peer.mesh?.sessionFile
    if (!path) return null
    const hosts = snapshot.herdrAgents.filter((host) => host.sessionPath === path)
    return hosts.length === 1 ? hosts[0] : null
  }
  const focusPeer = async (peer: MeshPeer) => {
    setContextMenu(null)
    if (!canControl(peer) || !herdrHost(peer) || focusing) return
    setFocusing(peer.id)
    store.setActionError(null)
    try { await ctx.psm.mesh.focus(normalizePiSessionId(peer.mesh?.sessionId)) }
    catch (error) { store.setActionError(error instanceof Error ? error.message : String(error)) }
    finally { setFocusing(null) }
  }
  const resumeSession = async (session: SessionInfo) => {
    const sessionId = normalizePiSessionId(session.id)
    const registrations = peers.filter((p) => p.mesh && (p.mesh.sessionFile === session.path || (sessionId && normalizePiSessionId(p.mesh.sessionId) === sessionId)))
    if (registrations.length > 0) {
      const peer = registrations.length === 1 ? registrations[0] : null
      if (peer && peer.mesh?.sessionFile === session.path && normalizePiSessionId(peer.mesh.sessionId) === sessionId && canControl(peer) && herdrHost(peer)) await focusPeer(peer)
      else store.setActionError(t('resumeUnavailable', '该 Mesh 会话没有可聚焦的 Herdr 窗口'))
      return
    }
    await data?.onResumeSession?.(session)
  }
  const handleSelectPeer = async (peer: MeshPeer) => {
    const session = await resolveSession(peer)
    if (session) setPreviewSession(session)
    else if (canControl(peer)) setMessagePeer(peer)
  }
  const openContextMenu = async (peer: MeshPeer, point: { x: number; y: number }) => {
    const session = await resolveSession(peer)
    if (session) setContextMenu({ peer, session, point })
  }
  const peerActions = (peer: MeshPeer, compact = false) => (
    <div className={`mesh-peer-actions ${compact ? 'mesh-peer-action--compact' : ''}`} onClick={(event) => event.stopPropagation()}>
      {canControl(peer) && <button type="button"
        onClick={() => { store.setActionError(null); setContextMenu(null); setMessagePeer(peer) }}
        title={t('sendMessage', '发送消息')} aria-label={`${t('sendMessage', '发送消息')} · ${peer.title}`}
        className="mesh-peer-action mesh-peer-action--primary">
        <Send className="h-3 w-3" /><span className="mesh-action__label">{t('sendMessage', '发送消息')}</span>
      </button>}
      {peer.mesh && <button type="button" onClick={() => void focusPeer(peer)}
        disabled={!canControl(peer) || !herdrHost(peer) || focusing !== null}
        title={herdrHost(peer) ? `${t('focusHerdr', '在 Herdr 中聚焦')} · ${herdrHost(peer)?.workspaceId}` : t('noHerdr', '该会话未关联 Herdr')}
        aria-label={`${t('focusHerdr', '在 Herdr 中聚焦')} · ${peer.title}`}
        className="mesh-peer-action">
        {focusing === peer.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Terminal className="h-3 w-3" />}
        <span className="mesh-action__label">Herdr</span>
      </button>}
      <button type="button" title={t('openConversation', '打开对话')}
        aria-label={`${t('openConversation', '打开对话')} · ${peer.title}`}
        onClick={() => { setContextMenu(null); void handleSelectPeer(peer) }} className="mesh-peer-action mesh-peer-action--icon">
        <MessageSquare className="h-3.5 w-3.5" /><span className="sr-only mesh-action__label">{t('openConversation', '打开对话')}</span>
      </button>
    </div>
  )

  const handleExpandToFull = () => {
    if (!previewSession) return
    const session = previewSession
    setPreviewSession(null)
    data?.onSelectSession(session)
  }
  const startNewSession = async () => {
    if (!newSessionCwd) return
    try { await data?.onNewSession?.(newSessionCwd) }
    catch (error) { store.setActionError(error instanceof Error ? error.message : String(error)) }
  }
  const renderCard = (peer: MeshPeer) => (
    <MeshPeerCard key={peer.id} peer={peer} status={meshDisplayStatus(peer, snapshot.meshAvailable)}
      favorite={isFavoritePeer(peer, favoriteIds)} t={t}
      onOpen={() => void handleSelectPeer(peer)} onMenu={(point) => void openContextMenu(peer, point)}
      onFavorite={() => void store.toggleFavorite(peer)}
      onRename={peer.session && data?.onOpenPreviewRenameDialog ? () => data.onOpenPreviewRenameDialog?.(peer.session!) : undefined}
      actions={peerActions(peer)} />
  )
  const viewOptions = [
    { id: 'board', label: t('boardView', '看板'), icon: Columns3 },
    { id: 'topology', label: t('topologyView', '拓扑'), icon: Network },
    { id: 'table', label: t('tableView', '表格'), icon: Table },
  ] as const
  const filterOptions: MeshFilter[] = ['all', 'online', 'running', 'idle', 'favorites', 'offline']
  const emptyOnline = !snapshot.query.trim() && !snapshot.selectedRepo && snapshot.filter === 'online'
  const contextPeer = contextMenu ? peers.find((peer) => peer.id === contextMenu.peer.id) ?? contextMenu.peer : null

  return (
    <div className="mesh-workspace">
      <div className="mesh-viewport">
        <header className="mesh-toolbar" data-tauri-drag-region>
          <div className="mesh-toolbar__identity">
            <span className="mesh-toolbar__mark"><Network className="h-4 w-4" /></span>
            <div>
              <h2 className="mesh-toolbar__title">{t('title', 'Mesh')}</h2>
              <p className="mesh-toolbar__subtitle">{snapshot.onlineCount} {t('online', '在线')} · {snapshot.runningCount} {t('running', '运行中')}</p>
            </div>
          </div>
          <div className="mesh-search">
            <Search className="h-3.5 w-3.5" />
            <input value={snapshot.query} onChange={(event) => store.setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape' && snapshot.query) { event.stopPropagation(); store.setQuery('') } }}
              placeholder={t('search', '搜索会话或工作目录')} aria-label={t('search', '搜索会话或工作目录')} />
            {snapshot.query && <button type="button" aria-label={t('clearSearch', '清除搜索')} className="mesh-icon-button" onClick={() => store.setQuery('')}><X className="h-3.5 w-3.5" /></button>}
          </div>
          <div className="mesh-view-switch" role="group" aria-label={t('viewMode', '视图模式')}>
            {viewOptions.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" aria-pressed={snapshot.viewMode === id} aria-label={label} title={label}
                onClick={() => store.setViewMode(id)}><Icon className="h-3.5 w-3.5" /><span className="mesh-view-label">{label}</span></button>
            ))}
          </div>
          <div className="mesh-toolbar__actions">
            <button type="button" onClick={() => void store.refresh()} disabled={snapshot.refreshing || snapshot.loading}
              className="mesh-icon-button" title={t('refresh', '刷新')} aria-label={t('refresh', '刷新')}>
              <RefreshCw className={`h-3.5 w-3.5 ${snapshot.refreshing ? 'animate-spin' : ''}`} />
            </button>
            {data?.onNewSession && <button type="button" onClick={() => void startNewSession()} disabled={!newSessionCwd}
              className="mesh-button mesh-button--primary" title={newSessionCwd ? t('newSession', '新建会话') : t('chooseRepo', '请先选择代码仓库')}
              aria-label={t('newSession', '新建会话')}><Plus className="h-3.5 w-3.5" /><span className="mesh-new-label">{t('newSession', '新建会话')}</span></button>}
          </div>
        </header>
        <div className="mesh-filterbar">
          <label className="mesh-scope-select">
            <select className="mesh-status-select" aria-label={t('statusFilter', '会话状态')} value={snapshot.filter}
              onChange={(event) => store.setFilter(event.target.value as MeshFilter)}>
              {filterOptions.map((filter) => <option key={filter} value={filter}>{meshFilterLabel(filter, t)} · {filterCounts[filter]}</option>)}
            </select><ChevronDown className="h-3 w-3" />
          </label>
          <div className={`mesh-scope-chip ${snapshot.selectedRepo ? 'mesh-scope-chip--selected' : ''}`} title={snapshot.selectedRepo ?? undefined}>
            <Folder className="h-3 w-3 shrink-0" /><span>{snapshot.selectedRepo ? basenameForDisplay(snapshot.selectedRepo) : t('allRepos', '全部代码仓库')}</span>
            {snapshot.selectedRepo && <button type="button" className="mesh-icon-button" aria-label={t('clearRepo', '清除仓库筛选')} onClick={() => store.setSelectedRepo(null)}><X className="h-3 w-3" /></button>}
          </div>
          <span className="mesh-results-count" role="status" aria-live="polite">{filteredPeers.length} {t('sessions', '会话')}</span>
          {hasFilters && <button type="button" className="mesh-button" onClick={resetFilters} title={t('resetFilters', '重置筛选')}><X className="h-3 w-3" /><span>{t('resetFilters', '重置筛选')}</span></button>}
        </div>
        {!snapshot.meshAvailable && !snapshot.loading && <div className="mesh-connection-notice" role="status">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span title={snapshot.error ?? undefined}>{t('hubOffline', 'Mesh Hub 离线')} · {t('connectionHint', '正在重新连接，历史会话仍可查看')}</span>
          <button type="button" className="mesh-button" onClick={() => void store.refresh()} disabled={snapshot.refreshing}>{t('retry', '重试')}</button>
        </div>}
        {snapshot.actionError && <div role="alert" className="mesh-action-error">
          <Info className="h-3.5 w-3.5 shrink-0" /><span>{snapshot.actionError}</span>
          <button type="button" className="mesh-icon-button" aria-label={t('close', '关闭')} onClick={() => store.setActionError(null)}><X className="h-3.5 w-3.5" /></button>
        </div>}
        <div className="mesh-workspace__body">
          {snapshot.loading && filteredPeers.length === 0 ? (
            <div className="mesh-empty"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /><p>{t('loadingSessions', '正在同步 Mesh 会话…')}</p></div>
          ) : filteredPeers.length === 0 ? (
            <div className="mesh-empty">
              <span className="mesh-empty__icon">{emptyOnline ? <Network className="h-5 w-5" /> : <Search className="h-5 w-5" />}</span>
              <h3>{peers.length === 0 ? t('empty', '没有找到 Pi 会话') : emptyOnline ? t('noOnlineAgents', '暂无在线 Mesh 会话') : t('noMatches', '没有匹配当前筛选条件的会话')}</h3>
              <p>{emptyOnline ? t('onlineEmptyHint', '启动 Pi 会话后会自动显示在这里，也可以查看已有历史。') : t('filteredEmptyHint', '尝试调整关键词、状态或仓库范围。搜索会遵循当前筛选。')}</p>
              <div className="mesh-empty__actions">
                {peers.length > 0 && snapshot.filter !== 'all' && <button type="button" className="mesh-button mesh-button--primary" onClick={() => store.setFilter('all')}>{t('showAllSessions', '查看全部状态')}<ChevronRight className="h-3 w-3" /></button>}
                {hasFilters && <button type="button" className="mesh-button mesh-button--border" onClick={resetFilters}>{t('resetFilters', '重置筛选')}</button>}
                {peers.length === 0 && <button type="button" className="mesh-button mesh-button--border" onClick={() => void store.refresh()}>{t('refresh', '刷新')}</button>}
              </div>
            </div>
          ) : snapshot.viewMode === 'topology' ? (
            <MeshTopologyView peers={filteredPeers.map((peer) => ({ ...peer, status: meshDisplayStatus(peer, snapshot.meshAvailable) }))} onSelectPeer={handleSelectPeer} />
          ) : snapshot.viewMode === 'board' ? (
            <div className="mesh-board">
              {lanes.map((lane) => {
                const Icon = lane.status === 'running' ? Activity : lane.status === 'idle' ? PauseCircle : Archive
                return <section key={lane.status} className="mesh-lane" data-status={lane.status} aria-label={meshFilterLabel(lane.status, t)}>
                  <header className="mesh-lane__header"><span className="mesh-lane__icon"><Icon className="h-3.5 w-3.5" /></span>
                    <h3 className="mesh-lane__title">{meshFilterLabel(lane.status, t)}</h3><span className="mesh-lane__count">{lane.items.length}</span>
                  </header>
                  <div className="mesh-lane__cards">
                    {lane.visible.length ? lane.visible.map(renderCard) : <div className="mesh-lane__empty"><Icon className="h-5 w-5 opacity-50" /><span>{lane.status === 'running' ? t('noRunning', '暂无运行中的任务') : t('noIdle', '暂无空闲会话')}</span></div>}
                  </div>
                </section>
              })}
            </div>
          ) : (
            <div className="mesh-table"><table>
              <thead><tr>{['statusColumn', 'sessionColumn', 'repoColumn', 'branchColumn', 'modelColumn', 'lastActivity', 'actionsColumn'].map((key, index) => (
                <th key={key}>{t(key, ['状态', '会话标题', '代码仓库', '分支', '模型', '最近活动', '操作'][index])}</th>
              ))}</tr></thead>
              <tbody>{visiblePeers.map((peer) => {
                const status = meshDisplayStatus(peer, snapshot.meshAvailable)
                return <tr key={peer.id} onClick={() => void handleSelectPeer(peer)}
                  onContextMenu={(event) => { event.preventDefault(); void openContextMenu(peer, { x: event.clientX, y: event.clientY }) }}>
                  <td><span className="mesh-status" data-status={status}><span className="mesh-status__dot" />{meshFilterLabel(status, t)}</span></td>
                  <td className="mesh-table__title" title={peer.title}>{peer.title}</td>
                  <td className="mesh-table__muted" title={peer.cwd}>{peer.repoName}</td>
                  <td className="mesh-table__muted" title={peer.branch ?? undefined}>{peer.branch || '—'}</td>
                  <td className="mesh-table__muted" title={peer.mesh?.model}>{peer.mesh?.model?.split('/').pop() || '—'}</td>
                  <td className="mesh-table__muted">{meshRelativeTime(meshActivityTimestamp(peer), t)}</td>
                  <td><div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                    {peerActions(peer, true)}
                    {!peer.isEphemeral && <button type="button" className="mesh-icon-button" aria-label={`${t('sessionActions', '会话操作')} · ${peer.title}`}
                      onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); void openContextMenu(peer, { x: rect.left, y: rect.bottom }) }}><MoreHorizontal className="h-4 w-4" /></button>}
                  </div></td>
                </tr>
              })}</tbody>
            </table></div>
          )}
        </div>
        {filteredPeers.length > shownCount && snapshot.viewMode !== 'topology' && <footer className="mesh-pagination">
          <span>{t('showing', '已显示')} {shownCount} / {filteredPeers.length} {t('sessions', '会话')}</span>
          <button type="button" className="mesh-button mesh-button--border" onClick={() => setVisiblePeerLimit((limit) => limit + MESH_PEER_PAGE_SIZE)}>{t('loadMore', '加载更多')}<ChevronDown className="h-3 w-3" /></button>
        </footer>}
      </div>
      {messagePeer && <MeshMessageDialog ctx={ctx} peer={peers.find((peer) => peer.id === messagePeer.id) ?? messagePeer} store={store} onClose={() => setMessagePeer(null)} />}
      {contextMenu && contextPeer && <MeshSessionMenu session={contextPeer.session ?? contextMenu.session} point={contextMenu.point} data={data}
        favorites={snapshot.favorites} onToggleFavorite={() => void store.toggleFavorite({ ...contextPeer, session: contextMenu.session })}
        onClose={() => setContextMenu(null)} onResume={resumeSession}
        extraActions={<div className="mesh-context-actions border-b border-border/40 px-1 pb-1">{peerActions(contextPeer)}</div>} />}
      <SessionPreviewModal session={previewSession} isOpen={!!previewSession} onClose={() => setPreviewSession(null)}
        onExpand={handleExpandToFull} onResumeSession={resumeSession}
        onRename={() => { if (previewSession) data?.onOpenPreviewRenameDialog?.(previewSession) }}
        terminal={data?.terminal} piPath={data?.piPath} customCommand={data?.customCommand}
        resumeCommand={data?.resumeCommand} animationMode="origin-point" />
    </div>
  )
}
