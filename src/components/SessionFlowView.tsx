import { useMemo, useCallback, useEffect, memo } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { SessionEntry } from '../types'

interface SessionFlowViewProps {
  entries: SessionEntry[]
  activeLeafId?: string
  onNodeClick?: (leafId: string, targetId: string) => void
}

const NODE_W = 200
const NODE_H = 36
const GAP_X = 40
const GAP_Y = 16

// --- Custom node ---
const FlowNode = memo(({ data }: NodeProps) => {
  const d = data as { label: string; role: string; isActive: boolean; isInPath: boolean; skipped?: number }
  let bg = '#1e1e2e'
  let border = '#333'
  let color = '#999'

  if (d.role === 'user') {
    bg = '#1a3a5c'; border = '#2563eb'; color = '#93c5fd'
  } else if (d.role === 'assistant') {
    bg = '#1c2333'; border = '#475569'; color = '#cbd5e1'
  } else if (d.role === 'tool') {
    bg = '#1a2e1a'; border = '#22c55e'; color = '#86efac'
  } else if (d.role === 'meta') {
    bg = '#2a2a1e'; border = '#a3a300'; color = '#d4d490'
  }

  if (d.isActive) border = '#f59e0b'
  else if (d.isInPath) border = '#b45309'

  return (
    <div style={{
      width: NODE_W, height: NODE_H,
      background: bg, border: `1.5px solid ${border}`, borderRadius: 6,
      display: 'flex', alignItems: 'center', padding: '0 8px',
      cursor: 'pointer', overflow: 'hidden', fontSize: 11, color, lineHeight: '1.3',
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {d.label}
      </span>
      {d.skipped != null && d.skipped > 0 && (
        <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.5, flexShrink: 0 }}>+{d.skipped}</span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />
    </div>
  )
})
FlowNode.displayName = 'FlowNode'

const nodeTypes = { flow: FlowNode }

// --- Helpers ---
function getRole(entry: SessionEntry): string {
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

// --- Tree building ---
interface TreeNode {
  entry: SessionEntry
  children: TreeNode[]
}

function buildTree(entries: SessionEntry[]): TreeNode[] {
  const byId = new Map<string, SessionEntry>()
  const childrenMap = new Map<string, TreeNode[]>()
  for (const e of entries) {
    byId.set(e.id, e)
    childrenMap.set(e.id, [])
  }
  for (const e of entries) {
    if (e.parentId && byId.has(e.parentId)) {
      childrenMap.get(e.parentId)!.push({ entry: e, children: childrenMap.get(e.id) || [] })
    }
  }
  const roots: TreeNode[] = []
  for (const e of entries) {
    if (!e.parentId || !byId.has(e.parentId)) {
      roots.push({ entry: e, children: childrenMap.get(e.id) || [] })
    }
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => new Date(a.entry.timestamp || 0).getTime() - new Date(b.entry.timestamp || 0).getTime())
    n.children.forEach(sort)
  }
  roots.forEach(sort)
  return roots
}

// --- Key: collapse linear chains, keep only significant nodes ---
// Significant = user message, branch point (>1 child), leaf (0 children), meta event
interface CompactNode {
  entry: SessionEntry
  children: CompactNode[]
  skipped: number // how many nodes were collapsed into this edge
}

function isSignificant(node: TreeNode): boolean {
  const role = getRole(node.entry)
  if (role === 'user') return true
  if (role === 'meta') return true
  if (node.children.length !== 1) return true // branch point or leaf
  // toolResult is never significant on its own
  if (node.entry.type === 'message' && node.entry.message?.role === 'toolResult') return false
  return false
}

function compactTree(roots: TreeNode[]): CompactNode[] {
  function compact(node: TreeNode): CompactNode {
    // Walk down single-child chains to find next significant node
    let current = node
    let skipped = 0

    // If this node itself is significant, keep it and recurse children
    if (isSignificant(current)) {
      return {
        entry: current.entry,
        children: current.children.map(c => compact(c)),
        skipped: 0,
      }
    }

    // Not significant + single child: skip forward
    while (!isSignificant(current) && current.children.length === 1) {
      skipped++
      current = current.children[0]
    }

    // current is now significant (or has 0 or >1 children)
    return {
      entry: current.entry,
      children: current.children.map(c => compact(c)),
      skipped,
    }
  }

  return roots.map(r => compact(r))
}

// --- Layout ---
interface LayoutResult { nodes: Node[]; edges: Edge[] }

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
        data: { label, role, isActive, isInPath, skipped: node.skipped },
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
        style: { stroke: inPath ? '#b45309' : '#333', strokeWidth: inPath ? 2 : 1 },
        label: child.skipped > 0 ? `${child.skipped} skipped` : undefined,
        labelStyle: { fill: '#666', fontSize: 9 },
        labelBgStyle: { fill: '#111', fillOpacity: 0.8 },
        labelBgPadding: [4, 2] as [number, number],
      })
    }

    const minX = childRanges[0][0]
    const maxX = childRanges[childRanges.length - 1][1]
    nodes.push({
      id: node.entry.id, type: 'flow',
      position: { x: (minX + maxX) / 2, y: depth * (NODE_H + GAP_Y) },
      data: { label, role, isActive, isInPath, skipped: node.skipped },
    })
    return [minX, maxX]
  }

  for (const root of roots) place(root, 0)
  return { nodes, edges }
}

// --- Main component ---
function SessionFlowView({ entries, activeLeafId, onNodeClick }: SessionFlowViewProps) {
  const activePathIds = useMemo(() => {
    if (!activeLeafId) return new Set<string>()
    const byId = new Map<string, SessionEntry>()
    for (const e of entries) byId.set(e.id, e)
    const ids = new Set<string>()
    let cur = byId.get(activeLeafId)
    while (cur) {
      ids.add(cur.id)
      if (!cur.parentId || cur.parentId === cur.id) break
      cur = byId.get(cur.parentId)
    }
    return ids
  }, [entries, activeLeafId])

  const { layoutNodes, layoutEdges } = useMemo(() => {
    const rawTree = buildTree(entries)
    const compact = compactTree(rawTree)
    const { nodes, edges } = layoutTree(compact, activePathIds, activeLeafId)
    return { layoutNodes: nodes, layoutEdges: edges }
  }, [entries, activePathIds, activeLeafId])

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges)

  useEffect(() => {
    setNodes(layoutNodes)
    setEdges(layoutEdges)
  }, [layoutNodes, layoutEdges, setNodes, setEdges])

  const findNewestLeaf = useCallback((nodeId: string): string => {
    const byId = new Map<string, SessionEntry>()
    const childrenMap = new Map<string, SessionEntry[]>()
    for (const e of entries) { byId.set(e.id, e); childrenMap.set(e.id, []) }
    for (const e of entries) {
      if (e.parentId && byId.has(e.parentId)) childrenMap.get(e.parentId)!.push(e)
    }
    let current = nodeId
    while (true) {
      const children = childrenMap.get(current) || []
      if (children.length === 0) break
      current = children[children.length - 1].id
    }
    return current
  }, [entries])

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (!onNodeClick) return
    const leafId = findNewestLeaf(node.id)
    onNodeClick(leafId, node.id)
  }, [onNodeClick, findNewestLeaf])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView fitViewOptions={{ padding: 0.2 }}
        minZoom={0.05} maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
      >
        <Background gap={20} size={1} color="#222" />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as { role: string; isActive: boolean }
            if (d.isActive) return '#f59e0b'
            if (d.role === 'user') return '#2563eb'
            if (d.role === 'assistant') return '#475569'
            if (d.role === 'tool') return '#22c55e'
            return '#555'
          }}
          maskColor="rgba(0,0,0,0.7)"
          style={{ background: '#111' }}
        />
      </ReactFlow>
    </div>
  )
}

export default memo(SessionFlowView)
