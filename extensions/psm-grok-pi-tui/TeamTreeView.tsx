import { useEffect, useMemo, useState } from 'react'
import type { PsmCapabilityClient, PsmSessionReference } from '@pi-session-manager/plugin-sdk'

import { buildGrokPiTeamTree, loadGrokPiTeam, type GrokPiTeamTreeNode } from './team'

interface TeamTreeViewProps {
  client: PsmCapabilityClient
  session: PsmSessionReference
}

function statusLabel(status: GrokPiTeamTreeNode['status']): string {
  return status === 'running' ? 'RUNNING' : status.toUpperCase()
}

function statusClass(status: GrokPiTeamTreeNode['status']): string {
  if (status === 'failed') return 'text-destructive'
  if (status === 'running') return 'text-foreground'
  return 'text-muted-foreground'
}

function leafLabel(agentPath: string): string {
  return agentPath.split('/').filter(Boolean).at(-1) ?? agentPath
}

function TreeRows({
  nodes,
  continuations = [],
  openingPath,
  onOpen,
}: {
  nodes: GrokPiTeamTreeNode[]
  continuations?: boolean[]
  openingPath: string | null
  onOpen: (node: GrokPiTeamTreeNode) => void
}) {
  return <>
    {nodes.map((node, index) => {
      const last = index === nodes.length - 1
      return <div key={node.agentPath} role="none">
        <button
          type="button"
          role="treeitem"
          aria-level={continuations.length + 1}
          className="group flex w-full min-w-0 items-start gap-2 rounded-sm px-1 py-1 text-left font-mono text-xs hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          title={`Open ${node.agentPath}`}
          onClick={() => onOpen(node)}
        >
          <span className="shrink-0 whitespace-pre text-muted-foreground" aria-hidden="true">
            {continuations.map((continued) => continued ? '│  ' : '   ')}{last ? '└─ ' : '├─ '}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 truncate font-medium text-foreground">{leafLabel(node.agentPath)}</span>
              <span className={`shrink-0 ${statusClass(node.status)}`}>
                {node.status === 'running' ? '● ' : ''}{statusLabel(node.status)}
              </span>
            </span>
            <span className="block truncate text-muted-foreground" title={node.agentPath}>
              {node.type}{node.team ? ` · ${node.team}` : ''} · {node.description}
            </span>
          </span>
          <span className="shrink-0 pt-0.5 text-muted-foreground" aria-hidden="true">
            {openingPath === node.agentPath ? 'OPENING…' : '↗'}
          </span>
        </button>
        {node.children.length > 0 ? (
          <div role="group">
            <TreeRows
              nodes={node.children}
              continuations={[...continuations, !last]}
              openingPath={openingPath}
              onOpen={onOpen}
            />
          </div>
        ) : null}
      </div>
    })}
  </>
}

export default function TeamTreeView({ client, session }: TeamTreeViewProps) {
  const [agents, setAgents] = useState<Awaited<ReturnType<typeof loadGrokPiTeam>>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [openingPath, setOpeningPath] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setOpenError(null)
    void loadGrokPiTeam(client, session.path).then(
      (next) => { if (!cancelled) setAgents(next) },
      (reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) },
    ).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [client, session.path])

  const tree = useMemo(() => buildGrokPiTeamTree(agents), [agents])
  const running = useMemo(() => agents.filter((agent) => agent.status === 'running').length, [agents])

  const openAgent = async (node: GrokPiTeamTreeNode) => {
    if (openingPath) return
    setOpeningPath(node.agentPath)
    setOpenError(null)
    try {
      await client.sessions.open(node.childSessionFile, {
        target: 'browser',
        cwd: session.cwd ?? undefined,
      })
    } catch (reason) {
      setOpenError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setOpeningPath(null)
    }
  }

  if (loading) return <div className="px-2 py-1 font-mono text-xs text-muted-foreground" role="status">Reading team index…</div>
  if (error) return <div className="px-2 py-1 font-mono text-xs text-destructive" role="alert">Team index unavailable: {error}</div>
  if (tree.length === 0) return <div className="px-2 py-1 font-mono text-xs text-muted-foreground" role="status">No persisted V2 team for this session.</div>

  return <div className="flex h-full min-h-0 flex-col font-mono text-xs">
    <div className="shrink-0 border-b border-border/70 px-3 py-1.5 text-muted-foreground" role="status">
      {agents.length} agent{agents.length === 1 ? '' : 's'} · {running} running · click a row to open its session
    </div>
    {openError ? (
      <div className="shrink-0 border-b border-border/70 px-3 py-1.5 text-destructive" role="alert">
        Could not open agent session: {openError}
      </div>
    ) : null}
    <div className="min-h-0 flex-1 overflow-auto px-2 py-1" role="tree" aria-label="Persisted agent team">
      <TreeRows nodes={tree} openingPath={openingPath} onOpen={(node) => { void openAgent(node) }} />
    </div>
  </div>
}
