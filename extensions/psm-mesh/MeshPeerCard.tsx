import type { ReactNode } from 'react'
import { Clock, Cpu, Folder, GitBranch, MoreHorizontal, Pencil, Star, Wrench } from 'lucide-react'
import type { MeshPeer } from './meshHelpers'
import { basenameForDisplay } from './meshHelpers'
import { meshActivityTimestamp, meshRelativeTime, type MeshDisplayStatus, type MeshTranslate } from './meshUi'

export default function MeshPeerCard({ peer, status, favorite, t, onOpen, onMenu, onFavorite, onRename, actions }: {
  peer: MeshPeer
  status: MeshDisplayStatus
  favorite: boolean
  t: MeshTranslate
  onOpen: () => void
  onMenu: (point: { x: number; y: number }) => void
  onFavorite: () => void
  onRename?: () => void
  actions: ReactNode
}) {
  const timestamp = meshActivityTimestamp(peer)
  const model = peer.mesh?.model?.split('/').pop()
  return (
    <article role="button" tabIndex={0} aria-label={peer.title}
      data-status={status} className="mesh-peer-card group"
      onClick={onOpen}
      onContextMenu={(event) => { event.preventDefault(); onMenu({ x: event.clientX, y: event.clientY }) }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen() }
        if (event.key === 'F2' && onRename) { event.preventDefault(); onRename() }
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          onMenu({ x: rect.left + 12, y: rect.top + 32 })
        }
      }}>
      <div className="mesh-peer-card__head">
        <span className="mesh-status" data-status={status}><span className="mesh-status__dot" />
          {status === 'running' ? t('running', '运行中') : status === 'idle' ? t('idle', '空闲') : t('offline', '离线')}
        </span>
        {peer.isEphemeral && <span className="mesh-peer-card__memory">{t('memory', '临时会话')}</span>}
        <div className="mesh-peer-card__tools" onClick={(event) => event.stopPropagation()}>
          {peer.session && <button type="button" onClick={onFavorite}
            className={`mesh-icon-button ${favorite ? 'mesh-icon-button--favorite' : ''}`}
            title={favorite ? t('removeFavorite', '取消收藏') : t('addFavorite', '添加收藏')}
            aria-label={favorite ? 'Remove favorite' : 'Add favorite'}>
            <Star className={`h-3.5 w-3.5 ${favorite ? 'fill-current' : ''}`} />
          </button>}
          {!peer.isEphemeral && <button type="button" className="mesh-icon-button"
            title={t('sessionActions', '会话操作')} aria-label={`${t('sessionActions', '会话操作')} · ${peer.title}`}
            onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); onMenu({ x: rect.left, y: rect.bottom }) }}>
            <MoreHorizontal className="h-4 w-4" />
          </button>}
        </div>
      </div>
      <div className="mesh-peer-card__title-row">
        <h3 className="mesh-peer-card__title" title={peer.title}>{peer.title}</h3>
        {onRename && <button type="button" className="mesh-icon-button mesh-peer-card__rename"
          title={`${t('rename', '重命名')} · F2`} aria-label={`${t('rename', '重命名')} · ${peer.title}`}
          onClick={(event) => { event.stopPropagation(); onRename() }}><Pencil className="h-3 w-3" /></button>}
      </div>
      <div className="mesh-peer-card__metadata">
        <span title={peer.cwd} className="mesh-peer-card__repo"><Folder className="h-3 w-3" /><span>{peer.repoName}</span></span>
        {peer.branch && <span className="mesh-peer-card__branch" title={peer.branch}><GitBranch className="h-3 w-3" /><span>{peer.branch}</span></span>}
      </div>
      {model && <div className="mesh-peer-card__model" title={peer.mesh?.model}><Cpu className="h-3 w-3" /><span>{model}</span></div>}
      {peer.lastFile && <div className="mesh-peer-card__activity" title={peer.lastFile.path}>
        <Wrench className="h-3 w-3" /><span>{peer.lastFile.op === 'write' ? t('wrote', '写入') : t('edited', '编辑')} · {basenameForDisplay(peer.lastFile.path)}</span>
      </div>}
      <div className="mesh-peer-card__footer" onClick={(event) => event.stopPropagation()}>
        <span className="mesh-peer-card__time" title={timestamp ? `${t('lastActivity', '最近活动')} · ${new Date(timestamp).toLocaleString()}` : undefined}>
          <Clock className="h-3 w-3" /><span>{meshRelativeTime(timestamp, t)}</span>
        </span>
        {actions}
      </div>
    </article>
  )
}
