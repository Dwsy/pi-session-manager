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

// --- Layout constants ---
const NODE_W = 180
const NODE_H = 40
const GAP_X = 60
const GAP_Y = 20

// --- Compact custom node ---
const FlowNode = memo(({ data }: NodeProps) => {
  const d = data as { label: string; role: string; isActive: boolean; isInPath: boolean }
  let bg = 'var(--color-surface, #1e1e2e)'
  let border = 'var(--color-border, #333)'
  let color = 'var(--color-text-secondary, #999)'

  if (d.role === 'user') {
    bg = 'var(--color-user-bg, #1a3a5c)'
    border = 'var(--color-user-border, #2563eb)'
    color = 'var(--color-user-text, #93c5fd)'
  } else if (d.role === 'assistant') {
    bg = 'var(--color-assistant-bg, #1c2333)'
    border = 'var(--color-assistant-border, #475569)'
    color = 'var(--color-assistant-text, #cbd5e1)'
  } else if (d.role === 'tool') {
    bg = 'var(--color-tool-bg, #1a2e1a)'
    border = 'var(--color-tool-border, #22c55e)'
    color = 'var(--color-tool-text, #86efac)'
  }

  if (d.isActive) {
    border = 'var(--color-accent, #f59e0b)'
  } else if (d.isInPath) {
    border = 'var(--color-accent-dim, #b45309)'
  }

  return (
    <div
      style={{
        width: NODE_W,
        height: NODE_H,
        background: bg,
        border: `1.5px solid ${border}`,
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        cursor: 'pointer',
        overflow: 'hidden',
        fontSize: 11,
        color,
        lineHeight: '1.3',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
        {d.label}
      </span>
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
    const hasToolCall = content.some((c: any) => c.type === 'toolCall')
    return hasToolCall ? 'tool' : 'assistant'
  }
  if (role === 'toolResult') return 'tool'
  return 'meta'
}

function getLabel(entry: SessionEntry): string {
  if (entry.type === 'model_change') return '🔄 model change'
  if (entry.type === 'compaction') return '📦 compaction'
  if (entry.type === 'branch_summary') return '📝 branch summary'
  if (entry.type === 'custom_message') return '💬 custom'
  if (entry.type !== 'message' || !entry.message) return entry.type

  const msg = entry.message
  if (msg.role === 'user') {
    const content = Array.isArray(msg.content) ? msg.content : []
    const text = content.filter((c: any) => c.type === 'text' && c.text).map((c: any) => c.text).join(' ')
    return text.slice(0, 40) || 'User'
  }
  if (msg.role === 'assistant') {
    const content = Array.isArray(msg.content) ? msg.content : []
    const toolCalls = content.filter((c: any) => c.type === 'toolCall')
    if (toolCalls.length > 0) {
      const name = toolCalls[0].name || 'tool'
      return `🔧 ${name}${toolCalls.length > 1 ? ` +${toolCalls.length - 1}` : ''}`
    }
    const text = content.filter((c: any) => c.type === 'text' && c.text).map((c: any) => c.text).join(' ')
    return text.slice(0, 40) || 'Assistant'
  }
  if (msg.role === 'toolResult') return '↩ result'
  return msg.role || 'unknown'
}

// --- Tree layout (top-down, handles branching) ---
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
  // Sort children by timestamp
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => new Date(a.entry.timestamp || 0).getTime() - new Date(b.entry.timestamp || 0).getTime())
    n.children.forEach(sort)
  }
  roots.forEach(sort)
  return roots
}

interface LayoutResult {
  nodes: Node[]
  edges: Edge[]
}

function layoutTree(roots: TreeNode[], activePathIds: Set<string>, activeLeafId?: string): LayoutResult {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nextX = 0

  // Returns the x-range [minX, maxX] used by this subtree
  function place(node: TreeNode, depth: number): [number, number] {
    const role = getRole(node.entry)
    const label = getLabel(node.entry)
    const isActive = node.entry.id === activeLeafId
    const isInPath = activePathIds.has(node.entry.id)

    if (node.children.length === 0) {
      // Leaf: place at nextX
      const x = nextX
      nextX += NODE_W + GAP_X
      const y = depth * (NODE_H + GAP_Y)
      nodes.push({
        id: node.entry.id,
        type: 'flow',
        position: { x, y },
        data: { label, role, isActive, isInPath },
      })
      return [x, x]
    }

    // Place children first
    const childRanges: [number, number][] = []
    for (const child of node.children) {
      childRanges.push(place(child, depth + 1))
      // Add edge
      edges.push({
        id: `${node.entry.id}-${child.entry.id}`,
        source: node.entry.id,
        target: child.entry.id,
        style: {
          stroke: activePathIds.has(child.entry.id) ? 'var(--color-accent-dim, #b45309)' : 'var(--color-border, #333)',
          strokeWidth: activePathIds.has(child.entry.id) ? 2 : 1,
        },
      })
    }

    // Center parent above children
    const minX = childRanges[0][0]
    const maxX = childRanges[childRanges.length - 1][1]
    const x = (minX + maxX) / 2
    const y = depth * (NODE_H + GAP_Y)

    nodes.push({
      id: node.entry.id,
      type: 'flow',
      position: { x, y },
      data: { label, role, isActive, isInPath },
    })

    return [minX, maxX]
  }

  for (const root of roots) {
    place(root, 0)
  }

  return { nodes, edges }
}

// --- Main component ---
function SessionFlowView({ entries, activeLeafId, onNodeClick }: SessionFlowViewProps) {
  // Build active path
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

  // Filter: skip toolResult entries to keep the graph compact
  const filteredEntries = useMemo(() =>
    entries.filter(e => {
      if (e.type === 'message' && e.message?.role === 'toolResult') return false
      return true
    }),
    [entries]
  )

  // Build layout
  const { layoutNodes, layoutEdges } = useMemo(() => {
    const roots = buildTree(filteredEntries)
    const { nodes, edges } = layoutTree(roots, activePathIds, activeLeafId)
    return { layoutNodes: nodes, layoutEdges: edges }
  }, [filteredEntries, activePathIds, activeLeafId])

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutEdges)

  // Sync when layout changes (e.g. new entries, active leaf change)
  useEffect(() => {
    setNodes(layoutNodes)
    setEdges(layoutEdges)
  }, [layoutNodes, layoutEdges, setNodes, setEdges])

  // Find newest leaf from a node
  const findNewestLeaf = useCallback((nodeId: string): string => {
    const byId = new Map<string, SessionEntry>()
    const childrenMap = new Map<string, SessionEntry[]>()
    for (const e of entries) {
      byId.set(e.id, e)
      childrenMap.set(e.id, [])
    }
    for (const e of entries) {
      if (e.parentId && byId.has(e.parentId)) {
        childrenMap.get(e.parentId)!.push(e)
      }
    }
    let current = nodeId
    while (true) {
      const children = childrenMap.get(current) || []
      if (children.length === 0) break
      // Pick last child (newest by insertion order)
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
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.05}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background gap={20} size={1} color="var(--color-border, #222)" />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as { role: string; isActive: boolean; isInPath: boolean }
            if (d.isActive) return '#f59e0b'
            if (d.role === 'user') return '#2563eb'
            if (d.role === 'assistant') return '#475569'
            if (d.role === 'tool') return '#22c55e'
            return '#333'
          }}
          maskColor="rgba(0,0,0,0.7)"
          style={{ background: 'var(--color-surface, #111)' }}
        />
      </ReactFlow>
    </div>
  )
}

export default memo(SessionFlowView)
