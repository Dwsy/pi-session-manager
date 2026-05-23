import { useMemo, useCallback, useEffect, useRef, memo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react'
import { User, Bot, Wrench, Settings, FileText, ZoomIn, ZoomOut, Maximize, LocateFixed, GitBranch, List, Network } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import type { SessionEntry } from '@/types'
import { buildTree as buildSessionTree, type TreeNodeData } from '@/utils/session-tree'

type FilterMode = 'default' | 'no-tools' | 'user-only' | 'labeled-only' | 'all' | `tool-${string}`

interface SessionFlowViewProps {
  entries: SessionEntry[]
  activeLeafId?: string
  onNodeClick?: (leafId: string, targetId: string) => void
  filter?: FilterMode
  viewMode?: 'flow' | 'hierarchy'
  onViewModeChange?: (mode: 'flow' | 'hierarchy') => void
}

const NODE_W = 220
const NODE_H = 42
const GAP_X = 44
const GAP_Y = 18

type FlowRole = 'user' | 'assistant' | 'tool' | 'meta'

interface FlowNodeData {
  label: string
  role: FlowRole
  kind: string
  detail: string
  isActive: boolean
  isInPath: boolean
  skipped?: number
  skippedSummary?: string
}

// --- Custom node ---
const FlowNode = memo(({ data }: NodeProps) => {
  const d = data as unknown as FlowNodeData

  const roleClass = `flow-node flow-node-${d.role}${d.isActive ? ' flow-node-active' : ''}${d.isInPath ? ' flow-node-in-path' : ''}`

  const iconMap: Record<FlowRole, React.ReactNode> = {
    user: <User size={12} />,
    assistant: <Bot size={12} />,
    tool: <Wrench size={12} />,
    meta: <Settings size={12} />,
  }

  return (
    <div className={roleClass} style={{ width: NODE_W, height: NODE_H }} title={`${d.kind} · ${d.detail || d.label}`}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <span className="flow-node-icon">{iconMap[d.role] || <FileText size={12} />}</span>
      <span className="flow-node-main">
        <span className="flow-node-label">{d.label}</span>
        <span className="flow-node-kind">{d.kind}</span>
      </span>
      {d.skipped != null && d.skipped > 0 && (
        <span className="flow-node-skip" title={d.skippedSummary || `${d.skipped} compacted entries`}>+{d.skipped}</span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />
    </div>
  )
})
FlowNode.displayName = 'FlowNode'

const nodeTypes = { flow: FlowNode }

// --- Helpers ---
function getRole(entry: SessionEntry): FlowRole {
  if (entry.type !== 'message') return 'meta'
  const role = entry.message?.role
  if (role === 'user') return 'user'
  if (role === 'assistant') {
    const content = Array.isArray(entry.message?.content) ? entry.message!.content : []
    return content.some((c: any) => c.type === 'toolCall') ? 'tool' : 'assistant'
  }
  if (role === 'toolResult') return 'tool'
  return 'meta'
}

function getKind(entry: SessionEntry): string {
  if (entry.type === 'message' && entry.message?.role) return `message.${entry.message.role}`
  if (entry.type === 'label' && entry.targetId) return 'label.target'
  if (entry.type === 'model_change') return 'event.model'
  if (entry.type === 'thinking_level_change') return 'event.thinking'
  return entry.type
}

function getDetail(entry: SessionEntry): string {
  const parts = [`id ${entry.id.length > 12 ? `${entry.id.slice(0, 8)}...${entry.id.slice(-4)}` : entry.id}`]
  if (entry.parentId) parts.push(`parent ${entry.parentId.length > 12 ? `${entry.parentId.slice(0, 8)}...${entry.parentId.slice(-4)}` : entry.parentId}`)
  if (entry.targetId) parts.push(`target ${entry.targetId.length > 12 ? `${entry.targetId.slice(0, 8)}...${entry.targetId.slice(-4)}` : entry.targetId}`)
  return parts.join(' · ')
}

function getLabel(entry: SessionEntry): string {
  if (entry.type === 'model_change') return 'model change'
  if (entry.type === 'compaction') return 'compaction'
  if (entry.type === 'branch_summary') return 'branch summary'
  if (entry.type === 'custom_message') return 'custom'
  if (entry.type !== 'message' || !entry.message) return entry.type
  const msg = entry.message
  if (msg.role === 'user') {
    const content = Array.isArray(msg.content) ? msg.content : []
    const text = content.filter((c: any) => c.type === 'text' && c.text).map((c: any) => c.text).join(' ')
    return text.slice(0, 50) || 'User'
  }
  if (msg.role === 'assistant') {
    const content = Array.isArray(msg.content) ? msg.content : []
    const toolCalls = content.filter((c: any) => c.type === 'toolCall')
    if (toolCalls.length > 0) {
      const name = toolCalls[0].name || 'tool'
      return `${name}${toolCalls.length > 1 ? ` +${toolCalls.length - 1}` : ''}`
    }
    const text = content.filter((c: any) => c.type === 'text' && c.text).map((c: any) => c.text).join(' ')
    return text.slice(0, 50) || 'Assistant'
  }
  return msg.role || 'unknown'
}



// --- Key: collapse linear chains, keep only significant nodes ---
// Significant = user message, branch point (>1 child), leaf (0 children), meta event
interface CompactNode {
  entry: SessionEntry
  children: CompactNode[]
  skipped: number
  skippedSummary: string // e.g. "bash, read, edit"
}

// Skip these types entirely - they're metadata, not conversation
const SKIP_TYPES = new Set(['session', 'thinking_level_change', 'label'])

function isSignificant(node: TreeNodeData, filter: FilterMode): boolean {
  const entry = node.entry
  if (SKIP_TYPES.has(entry.type)) return false

  // toolResult is never significant
  if (entry.type === 'message' && entry.message?.role === 'toolResult') return false

  // Branch points and leaves are always significant (structural)
  if (node.children.length !== 1) {
    // But still apply filter to leaves
    if (node.children.length === 0) return matchesFilter(entry, filter)
    return true
  }

  return matchesFilter(entry, filter)
}

function matchesFilter(entry: SessionEntry, filter: FilterMode): boolean {
  switch (filter) {
    case 'default':
      if (entry.type !== 'message') return true
      return entry.message?.role === 'user' || entry.message?.role === 'assistant'

    case 'no-tools':
      if (entry.type === 'message' && entry.message?.role === 'toolResult') return false
      if (entry.type !== 'message') return true
      return entry.message?.role === 'user' || entry.message?.role === 'assistant'

    case 'user-only':
      return entry.type === 'message' && entry.message?.role === 'user'

    case 'all':
      return true

    case 'labeled-only':
      return entry.type === 'message' && entry.message?.role === 'user'

    default:
      if (filter.startsWith('tool-')) {
        const toolName = filter.slice(5)
        if (entry.type === 'message' && entry.message?.role === 'user') return true
        if (entry.type === 'message' && entry.message?.role === 'assistant') {
          const content = Array.isArray(entry.message.content) ? entry.message.content : []
          return content.some((c: any) => c.type === 'toolCall' && c.name === toolName)
        }
        return false
      }
      return true
  }
}

function getSkipLabel(entry: SessionEntry): string {
  if (entry.type !== 'message') return entry.type
  const msg = entry.message
  if (!msg) return 'unknown'
  if (msg.role === 'toolResult') return 'result'
  if (msg.role === 'assistant') {
    const content = Array.isArray(msg.content) ? msg.content : []
    const toolCalls = content.filter((c: any) => c.type === 'toolCall')
    if (toolCalls.length > 0) return toolCalls[0].name || 'tool'
    return 'assistant'
  }
  return msg.role || 'unknown'
}

function compactTree(roots: TreeNodeData[], filter: FilterMode): CompactNode[] {
  function compact(node: TreeNodeData): CompactNode | null {
    let current = node
    let skipped = 0
    const skippedLabels: string[] = []

    if (isSignificant(current, filter)) {
      const children = current.children.map(c => compact(c)).filter((c): c is CompactNode => c !== null)
      return {
        entry: current.entry,
        children,
        skipped: 0,
        skippedSummary: '',
      }
    }

    while (!isSignificant(current, filter) && current.children.length === 1) {
      skippedLabels.push(getSkipLabel(current.entry))
      skipped++
      current = current.children[0]
    }

    if (!isSignificant(current, filter) && current.children.length === 0) {
      return null
    }

    const counts = new Map<string, number>()
    for (const l of skippedLabels) {
      if (l !== 'result') counts.set(l, (counts.get(l) || 0) + 1)
    }
    const summary = Array.from(counts.entries())
      .map(([name, cnt]) => cnt > 1 ? `${name} x${cnt}` : name)
      .join(', ')

    const children = current.children.map(c => compact(c)).filter((c): c is CompactNode => c !== null)
    return {
      entry: current.entry,
      children,
      skipped,
      skippedSummary: summary,
    }
  }

  return roots.map(r => compact(r)).filter((c): c is CompactNode => c !== null)
}

// --- Layout ---
interface LayoutResult { nodes: Node[]; edges: Edge[] }

// Hierarchy layout: show ALL nodes (no compaction)
function layoutHierarchy(roots: TreeNodeData[], activePathIds: Set<string>, activeLeafId?: string): LayoutResult {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nextX = 0

  function place(node: TreeNodeData, depth: number): [number, number] {
    const role = getRole(node.entry)
    const label = getLabel(node.entry)
    const isActive = node.entry.id === activeLeafId
    const isInPath = activePathIds.has(node.entry.id)

    if (node.children.length === 0) {
      const x = nextX
      nextX += NODE_W + GAP_X
      nodes.push({
        id: node.entry.id, type: 'flow',
        position: { x, y: depth * (NODE_H + GAP_Y) },
        data: { label, role, kind: getKind(node.entry), detail: getDetail(node.entry), isActive, isInPath } satisfies FlowNodeData,
      })
      return [x, x]
    }

    const childRanges: [number, number][] = []
    for (const child of node.children) {
      childRanges.push(place(child, depth + 1))
      const inPath = activePathIds.has(child.entry.id)
      edges.push({
        id: `${node.entry.id}-${child.entry.id}`,
        source: node.entry.id, target: child.entry.id,
        className: inPath ? 'flow-edge-active' : 'flow-edge',
      })
    }

    const minX = childRanges[0][0]
    const maxX = childRanges[childRanges.length - 1][1]
    nodes.push({
      id: node.entry.id, type: 'flow',
      position: { x: (minX + maxX) / 2, y: depth * (NODE_H + GAP_Y) },
      data: { label, role, kind: getKind(node.entry), detail: getDetail(node.entry), isActive, isInPath } satisfies FlowNodeData,
    })
    return [minX, maxX]
  }

  for (const root of roots) place(root, 0)
  return { nodes, edges }
}

function layoutTree(roots: CompactNode[], activePathIds: Set<string>, activeLeafId?: string): LayoutResult {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nextX = 0

  function place(node: CompactNode, depth: number): [number, number] {
    const role = getRole(node.entry)
    const label = getLabel(node.entry)
    const isActive = node.entry.id === activeLeafId
    const isInPath = activePathIds.has(node.entry.id)

    if (node.children.length === 0) {
      const x = nextX
      nextX += NODE_W + GAP_X
      nodes.push({
        id: node.entry.id, type: 'flow',
        position: { x, y: depth * (NODE_H + GAP_Y) },
        data: { label, role, kind: getKind(node.entry), detail: getDetail(node.entry), isActive, isInPath, skipped: node.skipped, skippedSummary: node.skippedSummary } satisfies FlowNodeData,
      })
      return [x, x]
    }

    const childRanges: [number, number][] = []
    for (const child of node.children) {
      childRanges.push(place(child, depth + 1))
      const inPath = activePathIds.has(child.entry.id)
      edges.push({
        id: `${node.entry.id}-${child.entry.id}`,
        source: node.entry.id, target: child.entry.id,
        className: inPath ? 'flow-edge-active' : 'flow-edge',
        label: child.skippedSummary || undefined,
        labelStyle: { fontSize: 9 },
        labelBgPadding: [4, 2] as [number, number],
      })
    }

    const minX = childRanges[0][0]
    const maxX = childRanges[childRanges.length - 1][1]
    nodes.push({
      id: node.entry.id, type: 'flow',
      position: { x: (minX + maxX) / 2, y: depth * (NODE_H + GAP_Y) },
      data: { label, role, kind: getKind(node.entry), detail: getDetail(node.entry), isActive, isInPath, skipped: node.skipped, skippedSummary: node.skippedSummary } satisfies FlowNodeData,
    })
    return [minX, maxX]
  }

  for (const root of roots) place(root, 0)
  return { nodes, edges }
}

// --- Main component ---
function SessionFlowView({ entries, activeLeafId, onNodeClick, filter = 'default', viewMode = 'flow', onViewModeChange }: SessionFlowViewProps) {
  const activePathIds = useMemo(() => {
    if (!activeLeafId) return new Set<string>()
    const byId = new Map<string, SessionEntry>()
    for (const e of entries) byId.set(e.id, e)
    const ids = new Set<string>()
    let cur = byId.get(activeLeafId)
    while (cur) {
      ids.add(cur.id)
      const pid = cur.parentId
      if (!pid || pid === cur.id || pid === "None" || pid === "null" || pid === "NONE") break
      cur = byId.get(pid)
    }
    return ids
  }, [entries, activeLeafId])

  const { layoutNodes, layoutEdges } = useMemo(() => {
    const rawTree = buildSessionTree(entries)

    // Hierarchy mode: show all nodes without compacting
    if (viewMode === 'hierarchy') {
      const { nodes, edges } = layoutHierarchy(rawTree, activePathIds, activeLeafId)
      return { layoutNodes: nodes, layoutEdges: edges }
    }

    // Flow mode: compact linear chains
    const compact = compactTree(rawTree, filter)
    const { nodes, edges } = layoutTree(compact, activePathIds, activeLeafId)
    return { layoutNodes: nodes, layoutEdges: edges }
  }, [entries, activePathIds, activeLeafId, filter, viewMode])

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges)

  useEffect(() => {
    setNodes(layoutNodes)
    setEdges(layoutEdges)
  }, [layoutNodes, layoutEdges, setNodes, setEdges])

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (!onNodeClick) return
    onNodeClick(node.id, node.id)
  }, [onNodeClick])

  return (
    <ReactFlowProvider>
      <FlowInner
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        activeLeafId={activeLeafId}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
      />
    </ReactFlowProvider>
  )
}

interface FlowInnerProps {
  nodes: Node[]
  edges: Edge[]
  onNodesChange: any
  onEdgesChange: any
  onNodeClick: (_: React.MouseEvent, node: Node) => void
  activeLeafId?: string
  viewMode?: 'flow' | 'hierarchy'
  onViewModeChange?: (mode: 'flow' | 'hierarchy') => void
}

function FlowInner({ nodes, edges, onNodesChange, onEdgesChange, onNodeClick, activeLeafId, viewMode = 'flow', onViewModeChange }: FlowInnerProps) {
  const { t } = useTranslation()
  const { zoomIn, zoomOut, fitView, setCenter, getZoom } = useReactFlow()
  const fitViewDoneRef = useRef(false)

  const flowStats = useMemo(() => {
    const counts: Record<FlowRole, number> = { user: 0, assistant: 0, tool: 0, meta: 0 }
    let activeNode: Node | null = null
    let pathCount = 0

    for (const node of nodes) {
      const data = node.data as unknown as FlowNodeData
      counts[data.role] += 1
      if (data.isInPath) pathCount += 1
      if (node.id === activeLeafId || data.isActive) activeNode = node
    }

    return { counts, activeNode, pathCount }
  }, [activeLeafId, nodes])

  const activeData = flowStats.activeNode?.data as unknown as FlowNodeData | undefined

  // Derive a stable key from node IDs to detect session changes
  const nodeKey = useMemo(() => nodes.map(n => n.id).join(','), [nodes])

  // Only fitView on initial mount, not on every nodes/edges change
  useEffect(() => {
    if (!fitViewDoneRef.current && nodes.length > 0) {
      fitViewDoneRef.current = true
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 0 }))
    }
  }, [nodes.length, fitView])

  // Reset fitView flag when session changes (new node set)
  useEffect(() => {
    fitViewDoneRef.current = false
  }, [nodeKey])

  const focusActive = useCallback(() => {
    if (!activeLeafId) { fitView({ padding: 0.2 }); return }
    const node = nodes.find(n => n.id === activeLeafId)
    if (node) {
      setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, { zoom: getZoom(), duration: 300 })
    }
  }, [activeLeafId, nodes, fitView, setCenter, getZoom])

  return (
    <div className="flow-shell">
      <div className="flow-inspector">
        <div className="flow-inspector-title">
          <Network size={13} />
          <span>{viewMode === 'flow' ? 'Compact flow' : 'Full hierarchy'}</span>
        </div>
        <div className="flow-inspector-stats">
          <span>{nodes.length} nodes</span>
          <span>{edges.length} links</span>
          <span>{flowStats.pathCount} path</span>
        </div>
        {activeData ? (
          <div className="flow-inspector-active">
            <span className={`flow-legend-dot flow-legend-${activeData.role}`} />
            <span className="flow-inspector-active-text">{activeData.label}</span>
            <span className="flow-inspector-kind">{activeData.kind}</span>
          </div>
        ) : null}
      </div>
      <div className="flow-toolbar">
        <button onClick={() => zoomIn({ duration: 200 })} title={t('components.sessionFlow.zoomIn')}><ZoomIn size={14} /></button>
        <button onClick={() => zoomOut({ duration: 200 })} title={t('components.sessionFlow.zoomOut')}><ZoomOut size={14} /></button>
        <button onClick={() => fitView({ padding: 0.2, duration: 300 })} title={t('components.sessionFlow.fitView')}><Maximize size={14} /></button>
        <button onClick={focusActive} title={t('components.sessionFlow.focusActive')}><LocateFixed size={14} /></button>
        {onViewModeChange && (
          <button
            onClick={() => onViewModeChange(viewMode === 'flow' ? 'hierarchy' : 'flow')}
            title={viewMode === 'flow' ? 'Switch to Hierarchy View' : 'Switch to Flow View'}
          >
            {viewMode === 'flow' ? <GitBranch size={14} /> : <List size={14} />}
          </button>
        )}
      </div>
      <div className="flow-legend" aria-hidden="true">
        <span><span className="flow-legend-dot flow-legend-user" />User {flowStats.counts.user}</span>
        <span><span className="flow-legend-dot flow-legend-assistant" />Assistant {flowStats.counts.assistant}</span>
        <span><span className="flow-legend-dot flow-legend-tool" />Tool {flowStats.counts.tool}</span>
        <span><span className="flow-legend-dot flow-legend-meta" />Meta {flowStats.counts.meta}</span>
      </div>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        minZoom={0.05} maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={true}
        panOnDrag={true}
        panOnScroll={false}
        zoomOnScroll={true}
        zoomOnPinch={false}
      >
        <Background gap={20} size={1} />
        {/* Enhanced interactive MiniMap with draggable viewport */}
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as { role: string; isActive: boolean }
            if (d.isActive) return 'var(--accent, #f0c674)'
            if (d.role === 'user') return 'var(--userMessageText, #81a2be)'
            if (d.role === 'tool') return 'var(--toolTitle, #b5bd68)'
            if (d.role === 'meta') return 'var(--customMessageLabel, #b294bb)'
            return 'var(--muted, #808080)'
          }}
          maskColor="rgb(var(--color-background) / 0.6)"
          nodeStrokeColor="rgb(var(--color-border))"
          pannable={true}
          zoomable={true}
          draggable
        />
      </ReactFlow>
    </div>
  )
}

export default memo(SessionFlowView)
