import { useEffect, useId, useRef } from 'react'
import { Send, X } from 'lucide-react'
import type { PsmPluginHostContext } from '@dwsy/plugin-sdk'
import PiLiveChatInput from '@/components/pi-live/PiLiveChatInput'
import { useEscapeToClose } from '@/components/dialogs/useEscapeToClose'
import type { MeshPeer } from './meshHelpers'
import type { MeshStore } from './meshStore'
import { useMeshSnapshot } from './meshStore'
import { normalizePiSessionId } from './meshHelpers'

export default function MeshMessageDialog({ ctx, peer, store, onClose }: {
  ctx: PsmPluginHostContext; peer: MeshPeer; store: MeshStore; onClose: () => void
}) {
  const snapshot = useMeshSnapshot(store)
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef(document.activeElement as HTMLElement | null)
  const targetId = normalizePiSessionId(peer.mesh?.sessionId)
  const matches = snapshot.meshAgents.filter((p) => normalizePiSessionId(p.sessionId) === targetId)
  const target = matches.length === 1 ? matches[0] : null
  const available = !!targetId && snapshot.meshAvailable && !!target && (target.state === 'running' || target.state === 'waiting')
  useEscapeToClose(onClose)
  useEffect(() => {
    return () => { if (previousFocus.current?.isConnected) previousFocus.current.focus() }
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 motion-overlay-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={rootRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return
          const nodes = rootRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), select:not([disabled])')
          if (!nodes?.length) return
          const first = nodes[0], last = nodes[nodes.length - 1]
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
          if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
        }}
        className="mesh-message-dialog motion-overlay-surface">
        <div className="mesh-message-dialog__header">
          <span className="mesh-toolbar__mark"><Send className="h-3.5 w-3.5" /></span>
          <div className="mesh-message-dialog__heading">
            <h3 id={titleId}>{ctx.i18n.t('plugins.psmMesh.sendMessage', '发送消息')}</h3>
            <p className="mesh-message-dialog__title">{peer.title}</p>
            <p className="mesh-message-dialog__path" title={peer.cwd}>{peer.cwd}</p>
          </div>
          <button type="button" aria-label={ctx.i18n.t('plugins.psmMesh.close', '关闭')}
            onClick={onClose} className="mesh-icon-button"><X className="h-4 w-4" /></button>
        </div>
        {!available && <p role="status" className="px-4 pt-3 text-xs text-muted-foreground">{ctx.i18n.t('plugins.psmMesh.targetOffline', '会话已离线，草稿已保留')}</p>}
        <PiLiveChatInput key={targetId} sessionId={targetId} binding={{
          kind: 'mesh', available, isRunning: target?.state === 'running',
          send: (text, mode) => ctx.psm.mesh.send({ targetSessionId: targetId, text, mode }),
          cancel: () => ctx.psm.mesh.cancel(targetId),
        }} onSent={() => void store.refresh(true)} />
      </div>
    </div>
  )
}
