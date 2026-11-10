import { useMemo, useState } from 'react'
import {
  Folder,
  GitBranch,
  MessageSquare,
  Network,
  Wrench,
} from 'lucide-react'
import type { MeshPeer } from './meshHelpers'
import { basenameForDisplay } from './meshHelpers'

export interface MeshTopologyViewProps {
  peers: MeshPeer[]
  onSelectPeer: (peer: MeshPeer) => void
  t?: (key: string, fallback: string) => string
}

export default function MeshTopologyView({
  peers,
  onSelectPeer,
}: MeshTopologyViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const onlinePeers = useMemo(
    () => peers.filter((p) => p.status === 'running' || p.status === 'idle'),
    [peers],
  )

  const selectedPeer = useMemo(
    () => peers.find((p) => p.id === selectedNodeId) || onlinePeers[0] || null,
    [onlinePeers, peers, selectedNodeId],
  )

  // Calculate radial topology layout
  const layout = useMemo(() => {
    const cx = 380
    const cy = 260
    const radius = Math.min(cx, cy) - 80

    const nodes = onlinePeers.map((peer, index) => {
      const angle = (index / Math.max(1, onlinePeers.length)) * 2 * Math.PI - Math.PI / 2
      const x = cx + radius * Math.cos(angle)
      const y = cy + radius * Math.sin(angle)
      return { peer, x, y, angle }
    })

    // Edges from "following"
    const edges: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; targetId: string }> = []
    for (const source of nodes) {
      const following = source.peer.mesh?.following || []
      for (const targetId of following) {
        const target = nodes.find((n) => n.peer.mesh?.sessionId === targetId)
        if (target) {
          edges.push({ from: { x: source.x, y: source.y }, to: { x: target.x, y: target.y }, targetId })
        }
      }
    }

    return { cx, cy, nodes, edges }
  }, [onlinePeers])

  return (
    <div className="h-full w-full flex flex-col lg:flex-row overflow-hidden bg-background select-none">
      {/* Topology Canvas Area */}
      <div className="flex-1 min-h-[360px] relative overflow-hidden flex items-center justify-center border-b lg:border-b-0 lg:border-r border-border/40 bg-radial from-secondary/15 via-background to-background">
        <svg
          className="w-full h-full max-w-[800px] max-h-[560px]"
          viewBox="0 0 760 520"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Glow filters */}
            <filter id="glow-running" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            <filter id="glow-hub" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            {/* Gradients */}
            <linearGradient id="edge-running" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity="0.3" />
            </linearGradient>
            <linearGradient id="edge-idle" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgb(148, 163, 184)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(148, 163, 184)" stopOpacity="0.1" />
            </linearGradient>
            {/* Marker arrow */}
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="rgb(16, 185, 129)" opacity="0.8" />
            </marker>
          </defs>

          {/* Background orbital rings */}
          <circle cx={layout.cx} cy={layout.cy} r="180" fill="none" stroke="currentColor" strokeWidth="1" className="text-border/20" strokeDasharray="4 6" />
          <circle cx={layout.cx} cy={layout.cy} r="100" fill="none" stroke="currentColor" strokeWidth="1" className="text-border/15" />

          {/* Center Hub Connection Lines */}
          {layout.nodes.map(({ peer, x, y }) => {
            const isRunning = peer.status === 'running'
            return (
              <line
                key={`hub-line-${peer.id}`}
                x1={layout.cx}
                y1={layout.cy}
                x2={x}
                y2={y}
                stroke={isRunning ? 'url(#edge-running)' : 'url(#edge-idle)'}
                strokeWidth={isRunning ? '1.5' : '1'}
                strokeDasharray={isRunning ? undefined : '2 4'}
                className={isRunning ? 'animate-pulse' : undefined}
              />
            )
          })}

          {/* Directed Follower Edges between Agents */}
          {layout.edges.map((edge, idx) => (
            <path
              key={`edge-${idx}`}
              d={`M ${edge.from.x} ${edge.from.y} Q ${layout.cx} ${layout.cy} ${edge.to.x} ${edge.to.y}`}
              fill="none"
              stroke="rgb(16, 185, 129)"
              strokeWidth="2"
              markerEnd="url(#arrow)"
              strokeDasharray="4 4"
              className="animate-pulse"
            />
          ))}

          {/* Center Node: Mesh Hub Router */}
          <g transform={`translate(${layout.cx}, ${layout.cy})`}>
            <circle r="36" fill="rgb(var(--color-card, 36 37 54))" stroke="rgb(var(--accent-rgb, 138 190 183))" strokeWidth="2" filter="url(#glow-hub)" />
            <circle r="42" fill="none" stroke="rgb(16, 185, 129)" strokeWidth="1" opacity="0.4" className="animate-ping" />
            <Network className="h-6 w-6 text-primary -translate-x-3 -translate-y-3 pointer-events-none" />
            <text y="48" textAnchor="middle" className="text-[10px] font-mono fill-muted-foreground font-semibold">
              Mesh Hub :9221
            </text>
          </g>

          {/* Outer Peer Nodes */}
          {layout.nodes.map(({ peer, x, y }) => {
            const isRunning = peer.status === 'running'
            const isSelected = selectedPeer?.id === peer.id

            return (
              <g
                key={peer.id}
                transform={`translate(${x}, ${y})`}
                onClick={() => {
                  setSelectedNodeId(peer.id)
                  onSelectPeer(peer)
                }}
                className="cursor-pointer group"
              >
                {/* Ping wave for running agents */}
                {isRunning && (
                  <circle r="26" fill="none" stroke="rgb(16, 185, 129)" strokeWidth="1" className="animate-ping opacity-60" />
                )}

                {/* Node Base Circle */}
                <circle
                  r={isSelected ? 22 : 18}
                  fill="rgb(var(--color-card, 36 37 54))"
                  stroke={isRunning ? 'rgb(16, 185, 129)' : isSelected ? 'rgb(var(--color-primary))' : 'rgb(var(--borderMuted, 80 80 80))'}
                  strokeWidth={isSelected ? 3 : 2}
                  className="transition-all duration-200 group-hover:scale-110"
                />

                {/* Status Dot in Center */}
                <circle
                  r="4"
                  fill={isRunning ? 'rgb(16, 185, 129)' : 'rgb(56, 189, 248)'}
                />

                {/* Node Labels */}
                <text
                  y="30"
                  textAnchor="middle"
                  className={`text-[11px] font-medium transition-colors ${
                    isSelected ? 'fill-primary font-bold' : 'fill-foreground group-hover:fill-primary'
                  }`}
                >
                  {peer.repoName}
                </text>
                <text
                  y="42"
                  textAnchor="middle"
                  className="text-[9px] font-mono fill-muted-foreground truncate"
                >
                  {peer.branch ? `⑂ ${peer.branch}` : (peer.mesh?.model?.split('/').pop() || 'Agent')}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Floating Canvas Legend */}
        <div className="absolute bottom-3 left-3 rounded-lg border border-border/40 bg-card/80 backdrop-blur-xs px-2.5 py-1.5 text-[10px] text-muted-foreground flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>执行中</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span>待命中</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-3 bg-emerald-500 stroke-dasharray" />
            <span>Follow 拓扑</span>
          </span>
        </div>
      </div>

      {/* Node Inspector Side Panel */}
      <aside className="w-full lg:w-80 shrink-0 bg-card/40 flex flex-col p-4 overflow-y-auto space-y-4">
        {selectedPeer ? (
          <>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-medium bg-secondary text-foreground">
                  <span className={`h-2 w-2 rounded-full ${selectedPeer.status === 'running' ? 'bg-success animate-pulse' : 'bg-primary/70'}`} />
                  <span className="uppercase">{selectedPeer.status}</span>
                </span>
                {selectedPeer.branch && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                    <GitBranch className="h-2.5 w-2.5" />
                    <span>{selectedPeer.branch}</span>
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-foreground mt-2 leading-snug">
                {selectedPeer.title}
              </h3>
              <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono mt-1">
                <Folder className="h-3 w-3 shrink-0" />
                <span className="truncate">{selectedPeer.cwd || selectedPeer.repoName}</span>
              </div>
            </div>

            {/* Runtime Meta Box */}
            <div className="rounded-lg border border-border/40 bg-secondary/30 p-2.5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">模型:</span>
                <span className="font-mono text-foreground">{selectedPeer.mesh?.model || 'Pi Model'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">进程 PID:</span>
                <span className="font-mono text-foreground">{selectedPeer.mesh?.pid || '-'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">所属机器:</span>
                <span className="font-mono text-foreground">{selectedPeer.mesh?.machineId || 'local'}</span>
              </div>
              {selectedPeer.mesh?.startedAt && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">启动时间:</span>
                  <span className="font-mono text-foreground">{new Date(selectedPeer.mesh.startedAt).toLocaleTimeString()}</span>
                </div>
              )}
            </div>

            {/* Recent File Mutation */}
            {selectedPeer.mesh?.files && selectedPeer.mesh.files.length > 0 && (
              <div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                  文件活动 ({selectedPeer.mesh.files.length})
                </span>
                <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                  {selectedPeer.mesh.files.slice(-5).map((file, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-secondary/40 rounded px-2 py-1 font-mono text-[10px]">
                      <span className="flex items-center gap-1.5 truncate">
                        <Wrench className="h-2.5 w-2.5 text-success shrink-0" />
                        <span className="truncate">{basenameForDisplay(file.path)}</span>
                      </span>
                      <span className="text-muted-foreground uppercase">{file.op}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onSelectPeer(selectedPeer)}
                className="w-full flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground py-2 text-xs font-semibold hover:bg-primary/90 transition-colors shadow-xs"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>打开完整会话</span>
              </button>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-center text-xs text-muted-foreground">
            选择拓扑节点查看详情
          </div>
        )}
      </aside>
    </div>
  )
}
