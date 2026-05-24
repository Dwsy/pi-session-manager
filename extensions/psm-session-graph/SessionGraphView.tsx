import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import {
  Background,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { Bot, Clipboard, Download, FileText, GitBranch, List, LocateFixed, Maximize, Network, Search, Settings, User, Wrench, ZoomIn, ZoomOut } from 'lucide-react'
import '@xyflow/react/dist/style.css'

import type { PsmSessionJsonlEntry } from '@pi-session-manager/plugin-sdk'
import { ensureSessionGraphStyles } from './styles'

type ViewMode = 'flow' | 'hierarchy'
type FilterMode = string
type GraphFilter = 'inherit' | 'all' | 'role-user' | 'role-assistant' | 'role-toolResult' | 'role-system' | 'role-session' | 'label' | 'branch'
type FlowRole = 'user' | 'assistant' | 'toolResult' | 'system' | 'developer' | 'session' | 'label' | 'model' | 'thinking' | 'branch' | 'meta'

interface SessionGraphViewProps {
  entries: PsmSessionJsonlEntry[]
  labelsByTargetId?: Record<string, string>
  activeEntryId?: string | null
  filter?: FilterMode
  viewMode: ViewMode
  onNavigate?: (leafId: string, targetId: string) => void
}

interface TreeNode {
  entry: PsmSessionJsonlEntry
  label?: string
  children: TreeNode[]
}

interface CompactNode {
  entry: PsmSessionJsonlEntry
  label?: string
  children: CompactNode[]
  skipped: number
  skippedSummary: string
  skippedIds: string[]
}

interface FlowNodeData extends Record<string, unknown> {
  label: string
  preview: string
  meta: string
  badge?: string
  labelTag?: string
  role: FlowRole
  kind: string
  detail: string
  entryId: string
  parentId?: string
  targetId?: string
  toolSummary?: string
  childIds: string[]
  isActive: boolean
  isInPath: boolean
  skipped?: number
  skippedSummary?: string
  skippedIds?: string[]
}

const NODE_W = 292
const NODE_H = 92
const GAP_X = 44
const GAP_Y = 18
const MAX_FLOW_NODES = 800
const MAX_HIERARCHY_NODES = 1200
const SYNTHETIC_ROOT_ID = '__psm_session_root__'
const SKIP_TYPES = new Set(['session', 'thinking_level_change', 'label'])
const GRAPH_FILTERS: Array<{ id: GraphFilter; label: string }> = [
  { id: 'inherit', label: 'Tree' },
  { id: 'all', label: 'All' },
  { id: 'role-user', label: 'User' },
  { id: 'role-assistant', label: 'Assistant' },
  { id: 'role-toolResult', label: 'Tools' },
  { id: 'role-system', label: 'System' },
  { id: 'role-session', label: 'Session' },
  { id: 'label', label: 'Labels' },
  { id: 'branch', label: 'Branches' },
]

function isNoneParent(parentId: unknown): boolean {
  return parentId == null || parentId === 'None' || parentId === 'null' || parentId === 'NONE'
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function message(entry: PsmSessionJsonlEntry): Record<string, unknown> {
  return asRecord(entry.message)
}

function messageRole(entry: PsmSessionJsonlEntry): string | undefined {
  const role = message(entry).role
  return typeof role === 'string' ? role : undefined
}

function messageContent(entry: PsmSessionJsonlEntry): unknown[] {
  const content = message(entry).content
  return Array.isArray(content) ? content : []
}

function buildTree(entries: PsmSessionJsonlEntry[], labelsByTargetId: Record<string, string>): TreeNode[] {
  const nodes = new Map<string, TreeNode>()
  for (const entry of entries) {
    nodes.set(entry.id, { entry, label: labelsByTargetId[entry.id] ?? entry.label, children: [] })
  }

  const roots: TreeNode[] = []
  for (const node of nodes.values()) {
    const pid = isNoneParent(node.entry.parentId) ? null : node.entry.parentId
    const parent = pid && pid !== node.entry.id ? nodes.get(pid) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortChildren = (node: TreeNode) => {
    node.children.sort((a, b) => new Date(a.entry.timestamp || 0).getTime() - new Date(b.entry.timestamp || 0).getTime())
    node.children.forEach(sortChildren)
  }
  roots.forEach(sortChildren)

  if (roots.length <= 1) return roots

  const sessionEntry = entries.find((entry) => entry.type === 'session' || entry.type === 'session_info')
  const syntheticRoot: TreeNode = {
    entry: {
      type: 'session_root',
      id: SYNTHETIC_ROOT_ID,
      timestamp: sessionEntry?.timestamp ?? roots[0]?.entry.timestamp ?? '',
      name: sessionEntry?.name,
    },
    label: sessionEntry?.name ? `Session · ${sessionEntry.name}` : 'Session root',
    children: roots,
  }

  return [syntheticRoot]
}

export function buildSessionGraphTreeForTest(entries: PsmSessionJsonlEntry[], labelsByTargetId: Record<string, string> = {}): TreeNode[] {
  return buildTree(entries, labelsByTargetId)
}

function newestLeafMap(roots: TreeNode[]): Map<string, string> {
  const map = new Map<string, string>()
  function visit(node: TreeNode): string {
    if (node.children.length === 0) {
      map.set(node.entry.id, node.entry.id)
      return node.entry.id
    }
    const leaf = visit(node.children[node.children.length - 1])
    map.set(node.entry.id, leaf)
    return leaf
  }
  roots.forEach(visit)
  return map
}

function activePathIds(entries: PsmSessionJsonlEntry[], activeEntryId?: string | null): Set<string> {
  if (!activeEntryId) return new Set()
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const ids = new Set<string>()
  let current = byId.get(activeEntryId)
  while (current) {
    ids.add(current.id)
    const pid = current.parentId
    if (isNoneParent(pid) || pid === current.id || typeof pid !== 'string') break
    current = byId.get(pid)
  }
  return ids
}

function toolResultId(entry: PsmSessionJsonlEntry): string | null {
  if (entry.type !== 'message' || messageRole(entry) !== 'toolResult') return null
  const block = messageContent(entry).find((item) => asRecord(item).type === 'toolResult')
  const id = asRecord(block).id ?? message(entry).toolCallId
  return typeof id === 'string' && id ? id : null
}

function toolCallOwners(entries: PsmSessionJsonlEntry[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of entries) {
    if (entry.type !== 'message' || messageRole(entry) !== 'assistant') continue
    for (const block of messageContent(entry)) {
      const data = asRecord(block)
      if (data.type === 'toolCall' && typeof data.id === 'string' && data.id) {
        map.set(data.id, entry.id)
      }
    }
  }
  return map
}

function resolveTarget(entry: PsmSessionJsonlEntry, owners: Map<string, string>): string {
  if (entry.type === 'label' && typeof entry.targetId === 'string' && entry.targetId) return entry.targetId
  const resultId = toolResultId(entry)
  return resultId ? owners.get(resultId) ?? entry.id : entry.id
}

export function resolveSessionGraphNavigationForTest(entries: PsmSessionJsonlEntry[], nodeId: string): { leafId: string; targetId: string } {
  const roots = buildTree(entries, {})
  const leafMap = newestLeafMap(roots)
  const owners = toolCallOwners(entries)
  const entry = entries.find((candidate) => candidate.id === nodeId)
  const targetId = entry ? resolveTarget(entry, owners) : nodeId
  return {
    targetId,
    leafId: targetId === nodeId ? nodeId : (leafMap.get(nodeId) ?? nodeId),
  }
}

function roleOf(entry: PsmSessionJsonlEntry): FlowRole {
  if (entry.type === 'session' || entry.type === 'session_info' || entry.type === 'session_root') return 'session'
  if (entry.type === 'label') return 'label'
  if (entry.type === 'model_change') return 'model'
  if (entry.type === 'thinking_level_change') return 'thinking'
  if (entry.type === 'branch_summary') return 'branch'
  if (entry.type !== 'message') return 'meta'

  const role = messageRole(entry)
  if (role === 'user') return 'user'
  if (role === 'assistant') return 'assistant'
  if (role === 'toolResult' || role === 'bashExecution') return 'toolResult'
  if (role === 'system') return 'system'
  if (role === 'developer') return 'developer'
  return 'meta'
}

export function getSessionGraphNodeRoleForTest(entry: PsmSessionJsonlEntry): FlowRole {
  return roleOf(entry)
}

function kindOf(entry: PsmSessionJsonlEntry): string {
  const role = messageRole(entry)
  if (entry.type === 'message' && role) return `message.${role}`
  if (entry.type === 'label' && entry.targetId) return 'label.target'
  if (entry.type === 'model_change') return 'event.model'
  if (entry.type === 'thinking_level_change') return 'event.thinking'
  return entry.type
}

function shortId(id?: string): string {
  if (!id) return ''
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id
}

function truncateText(text: string, max = 160): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact
}

function stringifyCompact(value: unknown, max = 140): string {
  if (typeof value === 'string') return truncateText(value, max)
  if (value == null) return ''
  try { return truncateText(JSON.stringify(value), max) } catch { return String(value) }
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    const data = asRecord(block)
    if (data.type === 'text' && typeof data.text === 'string') parts.push(data.text)
    else if (data.type === 'thinking' && typeof data.thinking === 'string') parts.push(`Thinking: ${data.thinking}`)
    else if (data.type === 'image') parts.push('[image]')
    else if (data.type === 'toolCall') {
      const name = typeof data.name === 'string' ? data.name : 'tool'
      parts.push(`${name}(${stringifyCompact(data.arguments, 90)})`)
    }
  }
  return parts.join(' ')
}

function costSummary(usage: unknown): string {
  const data = asRecord(usage)
  const cost = asRecord(data.cost)
  const totalTokens = typeof data.totalTokens === 'number' ? `${data.totalTokens.toLocaleString()} tok` : ''
  const totalCost = typeof cost.total === 'number' ? `$${cost.total.toFixed(4)}` : ''
  return [totalTokens, totalCost].filter(Boolean).join(' · ')
}

interface EntrySummary {
  title: string
  preview: string
  meta: string
  badge?: string
}

function summarizeEntry(entry: PsmSessionJsonlEntry, label?: string): EntrySummary {
  const role = messageRole(entry)
  const msg = message(entry)
  if (entry.type === 'session_root') return { title: label || 'Session forest', preview: 'Visual root for multiple JSONL roots', meta: 'synthetic root', badge: 'root' }
  if (entry.type === 'session' || entry.type === 'session_info') return { title: entry.name ? String(entry.name) : 'Session metadata', preview: stringifyCompact({ cwd: entry.cwd, parentSession: entry.parentSession }, 180), meta: `session · ${shortId(entry.id)}`, badge: 'session' }
  if (entry.type === 'model_change') return { title: `${entry.provider || 'provider'} / ${entry.modelId || 'model'}`, preview: 'Model changed for following context', meta: `model · ${shortId(entry.id)}`, badge: 'model' }
  if (entry.type === 'thinking_level_change') return { title: `Thinking ${entry.thinkingLevel || 'changed'}`, preview: 'Reasoning level changed for following context', meta: `thinking · ${shortId(entry.id)}`, badge: String(entry.thinkingLevel || 'thinking') }
  if (entry.type === 'compaction') return { title: 'Context compaction', preview: truncateText(String(entry.summary || ''), 180), meta: `${entry.tokensBefore?.toLocaleString?.() || '?'} tokens before · ${shortId(entry.id)}`, badge: 'compact' }
  if (entry.type === 'branch_summary') return { title: 'Branch summary', preview: truncateText(String(entry.summary || ''), 180), meta: `from ${shortId(typeof entry.fromId === 'string' ? entry.fromId : undefined)} · ${shortId(entry.id)}`, badge: 'branch' }
  if (entry.type === 'label') return { title: label || String(entry.label || 'Label'), preview: `Bookmark on ${shortId(entry.targetId)}`, meta: `label · ${shortId(entry.id)}`, badge: 'label' }
  if (entry.type === 'custom') return { title: String(entry.customType || 'Custom state'), preview: stringifyCompact(entry.data, 180), meta: `custom · ${shortId(entry.id)}`, badge: 'custom' }
  if (entry.type === 'custom_message') return { title: String(entry.customType || 'Custom message'), preview: truncateText(contentText(entry.content), 180), meta: `custom message · ${shortId(entry.id)}`, badge: entry.display === false ? 'hidden' : 'display' }

  if (entry.type === 'message') {
    const text = truncateText(contentText(msg.content), 190)
    if (role === 'assistant') {
      const tools = toolSummaryOf(entry)
      const usage = costSummary(msg.usage)
      return { title: text || (tools ? `Calls ${tools}` : 'Assistant response'), preview: tools && text ? `Tools: ${tools}` : '', meta: [msg.model, usage, shortId(entry.id)].filter(Boolean).join(' · '), badge: msg.stopReason ? String(msg.stopReason) : 'assistant' }
    }
    if (role === 'toolResult') {
      const isError = msg.isError === true
      return { title: `${msg.toolName || 'Tool'} result${isError ? ' failed' : ''}`, preview: text || stringifyCompact(msg.details, 190), meta: `call ${shortId(typeof msg.toolCallId === 'string' ? msg.toolCallId : undefined)} · ${shortId(entry.id)}`, badge: isError ? 'error' : 'result' }
    }
    if (role === 'bashExecution') {
      return { title: String(msg.command || 'Bash execution'), preview: truncateText(String(msg.output || ''), 190), meta: `exit ${msg.exitCode ?? '?'} · ${shortId(entry.id)}`, badge: msg.cancelled ? 'cancelled' : 'bash' }
    }
    return { title: text || (role === 'user' ? 'User message' : `${role || 'Message'}`), preview: '', meta: `${role || 'message'} · ${shortId(entry.id)}`, badge: role }
  }

  return { title: entry.type, preview: stringifyCompact(entry, 180), meta: shortId(entry.id), badge: 'entry' }
}

export function summarizeSessionGraphEntryForTest(entry: PsmSessionJsonlEntry, label?: string): EntrySummary {
  return summarizeEntry(entry, label)
}

function toolSummaryOf(entry: PsmSessionJsonlEntry): string | undefined {
  const tools = messageContent(entry)
    .filter((block) => asRecord(block).type === 'toolCall')
    .map((block) => asRecord(block).name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
  if (tools.length > 0) return tools.join(', ')
  const resultId = toolResultId(entry)
  return resultId ? `result ${shortId(resultId)}` : undefined
}

function detailOf(entry: PsmSessionJsonlEntry): string {
  const parts = [`id ${shortId(entry.id)}`]
  if (entry.parentId) parts.push(`parent ${shortId(entry.parentId)}`)
  if (entry.targetId) parts.push(`target ${shortId(entry.targetId)}`)
  return parts.join(' · ')
}


function matchesFilter(entry: PsmSessionJsonlEntry, filter: FilterMode, label?: string): boolean {
  if (filter === 'all') return true
  if (filter.startsWith('role-')) return roleOf(entry) === filter.slice(5)
  if (filter === 'label') return roleOf(entry) === 'label' || Boolean(label || entry.label)
  if (filter === 'branch') return roleOf(entry) === 'branch'
  if (filter === 'user-only') return entry.type === 'message' && messageRole(entry) === 'user'
  if (filter === 'labeled-only') return Boolean(label || entry.label)
  if (filter === 'no-tools') return !(entry.type === 'message' && messageRole(entry) === 'toolResult')
  if (filter.startsWith('tool-')) {
    const tool = filter.slice(5)
    if (entry.type === 'message' && messageRole(entry) === 'user') return true
    return messageContent(entry).some((block) => asRecord(block).type === 'toolCall' && asRecord(block).name === tool)
  }
  if (entry.type !== 'message') return true
  return messageRole(entry) === 'user' || messageRole(entry) === 'assistant'
}

function skipLabel(entry: PsmSessionJsonlEntry): string {
  const role = messageRole(entry)
  if (entry.type !== 'message') return entry.type
  if (role === 'toolResult') return 'result'
  if (role === 'assistant') {
    const toolCall = messageContent(entry).find((block) => asRecord(block).type === 'toolCall')
    const name = asRecord(toolCall).name
    return typeof name === 'string' ? name : 'assistant'
  }
  return role || 'unknown'
}

function significant(node: TreeNode, filter: FilterMode): boolean {
  const entry = node.entry
  if (SKIP_TYPES.has(entry.type)) return false
  if (entry.type === 'message' && messageRole(entry) === 'toolResult') return false
  if (node.children.length !== 1) return node.children.length === 0 ? matchesFilter(entry, filter, node.label) : true
  return matchesFilter(entry, filter, node.label)
}

function compactTree(roots: TreeNode[], filter: FilterMode): CompactNode[] {
  function compact(node: TreeNode): CompactNode | null {
    let current = node
    let skipped = 0
    const labels: string[] = []
    const skippedIds: string[] = []

    if (significant(current, filter)) {
      return {
        entry: current.entry,
        label: current.label,
        children: current.children.map((child) => compact(child)).filter((child): child is CompactNode => child !== null),
        skipped: 0,
        skippedSummary: '',
        skippedIds: [],
      }
    }

    while (!significant(current, filter) && current.children.length === 1) {
      labels.push(skipLabel(current.entry))
      skippedIds.push(current.entry.id)
      skipped += 1
      current = current.children[0]
    }
    if (!significant(current, filter) && current.children.length === 0) return null

    const counts = new Map<string, number>()
    labels.filter((label) => label !== 'result').forEach((label) => counts.set(label, (counts.get(label) || 0) + 1))
    return {
      entry: current.entry,
      label: current.label,
      children: current.children.map((child) => compact(child)).filter((child): child is CompactNode => child !== null),
      skipped,
      skippedSummary: Array.from(counts).map(([name, count]) => count > 1 ? `${name} x${count}` : name).join(', '),
      skippedIds,
    }
  }
  return roots.map((root) => compact(root)).filter((node): node is CompactNode => node !== null)
}

export function compactSessionGraphTreeForTest(roots: TreeNode[], filter: FilterMode): CompactNode[] {
  return compactTree(roots, filter)
}

function filterTreeForView(roots: TreeNode[], filter: FilterMode): TreeNode[] {
  if (filter === 'all') return roots

  function visit(node: TreeNode): TreeNode | null {
    const children = node.children.map(visit).filter((child): child is TreeNode => child !== null)
    if (matchesFilter(node.entry, filter, node.label) || children.length > 0) {
      return { ...node, children }
    }
    return null
  }

  return roots.map(visit).filter((node): node is TreeNode => node !== null)
}

export function filterSessionGraphTreeForTest(roots: TreeNode[], filter: FilterMode): TreeNode[] {
  return filterTreeForView(roots, filter)
}

interface LayoutResult { nodes: Node[]; edges: Edge[] }

function limitLayout(layout: LayoutResult, pathIds: Set<string>, activeEntryId: string | undefined, limit: number): LayoutResult {
  if (layout.nodes.length <= limit) return layout
  const keep = new Set<string>()
  if (activeEntryId) keep.add(activeEntryId)
  pathIds.forEach((id) => keep.add(id))
  for (const node of layout.nodes) {
    if (keep.size >= limit) break
    keep.add(node.id)
  }
  const nodes = layout.nodes.filter((node) => keep.has(node.id))
  const ids = new Set(nodes.map((node) => node.id))
  return { nodes, edges: layout.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) }
}

function layoutHierarchy(roots: TreeNode[], pathIds: Set<string>, activeEntryId?: string): LayoutResult {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nextX = 0

  function place(node: TreeNode, depth: number): [number, number] {
    const summary = summarizeEntry(node.entry, node.label)
    const data: FlowNodeData = {
      label: summary.title,
      preview: summary.preview,
      meta: summary.meta,
      badge: summary.badge,
      labelTag: node.label,
      role: roleOf(node.entry),
      kind: kindOf(node.entry),
      detail: detailOf(node.entry),
      entryId: node.entry.id,
      parentId: node.entry.parentId,
      targetId: node.entry.targetId,
      toolSummary: toolSummaryOf(node.entry),
      childIds: node.children.map((child) => child.entry.id),
      isActive: node.entry.id === activeEntryId,
      isInPath: pathIds.has(node.entry.id),
    }

    if (node.children.length === 0) {
      const x = nextX
      nextX += NODE_W + GAP_X
      nodes.push({ id: node.entry.id, type: 'flow', position: { x, y: depth * (NODE_H + GAP_Y) }, data })
      return [x, x]
    }

    const ranges = node.children.map((child) => {
      const range = place(child, depth + 1)
      edges.push({ id: `${node.entry.id}-${child.entry.id}`, source: node.entry.id, target: child.entry.id, className: pathIds.has(child.entry.id) ? 'psm-graph-edge-active' : 'psm-graph-edge' })
      return range
    })
    const minX = ranges[0][0]
    const maxX = ranges[ranges.length - 1][1]
    nodes.push({ id: node.entry.id, type: 'flow', position: { x: (minX + maxX) / 2, y: depth * (NODE_H + GAP_Y) }, data })
    return [minX, maxX]
  }

  roots.forEach((root) => place(root, 0))
  return { nodes, edges }
}

function layoutFlow(roots: CompactNode[], pathIds: Set<string>, activeEntryId?: string): LayoutResult {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let nextX = 0

  function place(node: CompactNode, depth: number): [number, number] {
    const summary = summarizeEntry(node.entry, node.label)
    const data: FlowNodeData = {
      label: summary.title,
      preview: summary.preview,
      meta: summary.meta,
      badge: summary.badge,
      labelTag: node.label,
      role: roleOf(node.entry),
      kind: kindOf(node.entry),
      detail: detailOf(node.entry),
      entryId: node.entry.id,
      parentId: node.entry.parentId,
      targetId: node.entry.targetId,
      toolSummary: toolSummaryOf(node.entry),
      childIds: node.children.map((child) => child.entry.id),
      isActive: node.entry.id === activeEntryId,
      isInPath: pathIds.has(node.entry.id),
      skipped: node.skipped,
      skippedSummary: node.skippedSummary,
      skippedIds: node.skippedIds,
    }

    if (node.children.length === 0) {
      const x = nextX
      nextX += NODE_W + GAP_X
      nodes.push({ id: node.entry.id, type: 'flow', position: { x, y: depth * (NODE_H + GAP_Y) }, data })
      return [x, x]
    }

    const ranges = node.children.map((child) => {
      const range = place(child, depth + 1)
      edges.push({ id: `${node.entry.id}-${child.entry.id}`, source: node.entry.id, target: child.entry.id, className: pathIds.has(child.entry.id) ? 'psm-graph-edge-active' : 'psm-graph-edge', label: child.skippedSummary || undefined, labelStyle: { fontSize: 9 }, labelBgPadding: [4, 2] as [number, number] })
      return range
    })
    const minX = ranges[0][0]
    const maxX = ranges[ranges.length - 1][1]
    nodes.push({ id: node.entry.id, type: 'flow', position: { x: (minX + maxX) / 2, y: depth * (NODE_H + GAP_Y) }, data })
    return [minX, maxX]
  }

  roots.forEach((root) => place(root, 0))
  return { nodes, edges }
}

const FlowNode = memo(({ data }: NodeProps) => {
  const value = data as unknown as FlowNodeData
  const roleClass = `psm-graph-node psm-graph-node-${value.role}${value.isActive ? ' psm-graph-node-active' : ''}${value.isInPath ? ' psm-graph-node-path' : ''}`
  const icons: Record<FlowRole, ReactNode> = {
    user: <User size={12} />,
    assistant: <Bot size={12} />,
    toolResult: <Wrench size={12} />,
    system: <Settings size={12} />,
    developer: <FileText size={12} />,
    session: <Network size={12} />,
    label: <FileText size={12} />,
    model: <Settings size={12} />,
    thinking: <Settings size={12} />,
    branch: <Network size={12} />,
    meta: <Settings size={12} />,
  }
  return (
    <div className={roleClass} style={{ width: NODE_W, height: NODE_H }} title={`${value.kind} · ${value.detail}${value.skippedIds?.length ? ` · skipped ${value.skippedIds.join(', ')}` : ''}`}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <span className="psm-graph-node-icon">{icons[value.role] || <FileText size={12} />}</span>
      <span className="psm-graph-node-main">
        <span className="psm-graph-node-topline"><span className="psm-graph-node-label">{value.label}</span>{value.badge ? <span className="psm-graph-node-badge">{value.badge}</span> : null}</span>
        {value.preview ? <span className="psm-graph-node-preview">{value.preview}</span> : null}
        <span className="psm-graph-node-kind">{value.meta || value.kind}</span>
      </span>
      {value.skipped ? <span className="psm-graph-skip" title={value.skippedSummary}>+{value.skipped}</span> : null}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />
    </div>
  )
})
FlowNode.displayName = 'FlowNode'

const nodeTypes = { flow: FlowNode }

function GraphInner({ nodes, edges, activeEntryId, hiddenCount, viewMode, onViewModeChange, graphFilter, onFilterChange, onNodeClick }: {
  nodes: Node[]
  edges: Edge[]
  activeEntryId?: string | null
  hiddenCount: number
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  graphFilter: GraphFilter
  onFilterChange: (filter: GraphFilter) => void
  onNodeClick: (_: MouseEvent, node: Node) => void
}) {
  const { zoomIn, zoomOut, fitView, setCenter, getZoom } = useReactFlow()
  const [flowNodes, setNodes, onNodesChange] = useNodesState(nodes)
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(edges)
  const fitDoneRef = useRef(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null)
  const nodeKey = useMemo(() => nodes.map((node) => node.id).join(','), [nodes])

  useEffect(() => { setNodes(nodes); setEdges(edges) }, [edges, nodes, setEdges, setNodes])
  useEffect(() => { fitDoneRef.current = false }, [nodeKey])
  useEffect(() => {
    if (!fitDoneRef.current && flowNodes.length) {
      fitDoneRef.current = true
      requestAnimationFrame(() => fitView({ padding: 0.18, duration: 0 }))
    }
  }, [fitView, flowNodes.length])

  const stats = useMemo(() => {
    const counts: Record<FlowRole, number> = {
      user: 0,
      assistant: 0,
      toolResult: 0,
      system: 0,
      developer: 0,
      session: 0,
      label: 0,
      model: 0,
      thinking: 0,
      branch: 0,
      meta: 0,
    }
    let active: Node | null = null
    let path = 0
    for (const node of flowNodes) {
      const data = node.data as unknown as FlowNodeData
      counts[data.role] += 1
      if (data.isInPath) path += 1
      if (data.isActive || node.id === activeEntryId) active = node
    }
    return { counts, active, path }
  }, [activeEntryId, flowNodes])

  const inspectedNode = useMemo(
    () => flowNodes.find((node) => node.id === inspectedNodeId) ?? stats.active,
    [flowNodes, inspectedNodeId, stats.active],
  )
  const activeData = inspectedNode?.data as unknown as FlowNodeData | undefined
  const searchMatches = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []
    return flowNodes.filter((node) => {
      const data = node.data as unknown as FlowNodeData
      return [node.id, data.label, data.preview, data.meta, data.kind, data.detail, data.toolSummary, data.badge].filter(Boolean).join(' ').toLowerCase().includes(query)
    })
  }, [flowNodes, searchQuery])

  const focusNode = useCallback((node: Node) => {
    setCenter(node.position.x + NODE_W / 2, node.position.y + NODE_H / 2, { zoom: Math.max(getZoom(), 0.6), duration: 180 })
  }, [getZoom, setCenter])

  const focusSearchMatch = useCallback((direction: 1 | -1) => {
    if (searchMatches.length === 0) return
    const next = (searchIndex + direction + searchMatches.length) % searchMatches.length
    setSearchIndex(next)
    setInspectedNodeId(searchMatches[next].id)
    focusNode(searchMatches[next])
  }, [focusNode, searchIndex, searchMatches])

  useEffect(() => { setSearchIndex(0) }, [searchQuery])

  const copySummary = useCallback(async () => {
    const summary = {
      viewMode,
      filter: graphFilter,
      nodes: flowNodes.length,
      edges: flowEdges.length,
      hidden: hiddenCount,
      active: activeData,
    }
    await navigator.clipboard?.writeText(JSON.stringify(summary, null, 2))
  }, [activeData, flowEdges.length, flowNodes.length, graphFilter, hiddenCount, viewMode])

  const exportSummary = useCallback(() => {
    const payload = JSON.stringify({ viewMode, filter: graphFilter, nodes: flowNodes.map((node) => ({ id: node.id, data: node.data, position: node.position })), edges: flowEdges }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `psm-session-${viewMode}-graph.json`
    link.click()
    URL.revokeObjectURL(url)
  }, [flowEdges, flowNodes, graphFilter, viewMode])

  const handleGraphNodeClick = useCallback((event: MouseEvent, node: Node) => {
    setInspectedNodeId(node.id)
    onNodeClick(event, node)
  }, [onNodeClick])

  const focusActive = useCallback(() => {
    const active = stats.active
    if (!active) { fitView({ padding: 0.18 }); return }
    setInspectedNodeId(active.id)
    focusNode(active)
  }, [fitView, focusNode, stats.active])

  return (
    <div className="psm-graph-shell">
      <div className="psm-graph-canvas">
      <div className="psm-graph-toolbar">
        <button onClick={() => onViewModeChange(viewMode === 'flow' ? 'hierarchy' : 'flow')} title="Switch view">{viewMode === 'flow' ? <GitBranch size={14} /> : <List size={14} />}</button>
        <button onClick={() => zoomIn({ duration: 160 })} title="Zoom in"><ZoomIn size={14} /></button>
        <button onClick={() => zoomOut({ duration: 160 })} title="Zoom out"><ZoomOut size={14} /></button>
        <button onClick={() => fitView({ padding: 0.18, duration: 180 })} title="Fit view"><Maximize size={14} /></button>
        <button onClick={focusActive} title="Focus active"><LocateFixed size={14} /></button>
        <button onClick={copySummary} title="Copy structure"><Clipboard size={14} /></button>
        <button onClick={exportSummary} title="Export structure"><Download size={14} /></button>
      </div>
      <div className="psm-graph-searchbar">
        <Search size={13} />
        <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search JSONL" />
        <button type="button" onClick={() => focusSearchMatch(-1)} disabled={searchMatches.length === 0}>↑</button>
        <button type="button" onClick={() => focusSearchMatch(1)} disabled={searchMatches.length === 0}>↓</button>
        <span>{searchMatches.length ? `${searchIndex + 1}/${searchMatches.length}` : '0/0'}</span>
      </div>
      <div className="psm-graph-filterbar" role="radiogroup" aria-label="Graph filter">
        {GRAPH_FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={graphFilter === option.id}
            className={graphFilter === option.id ? 'active' : ''}
            onClick={() => onFilterChange(option.id)}
            title={option.label}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="psm-graph-legend" aria-hidden="true"><span><span className="psm-graph-dot psm-graph-dot-user" />User {stats.counts.user}</span><span><span className="psm-graph-dot psm-graph-dot-assistant" />Assistant {stats.counts.assistant}</span><span><span className="psm-graph-dot psm-graph-dot-toolResult" />Tool {stats.counts.toolResult}</span><span><span className="psm-graph-dot psm-graph-dot-label" />Label {stats.counts.label}</span><span><span className="psm-graph-dot psm-graph-dot-branch" />Branch {stats.counts.branch}</span><span><span className="psm-graph-dot psm-graph-dot-meta" />Meta {stats.counts.meta}</span></div>
      <ReactFlow nodes={flowNodes} edges={flowEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={handleGraphNodeClick} nodeTypes={nodeTypes} minZoom={0.05} maxZoom={2} proOptions={{ hideAttribution: true }} nodesDraggable={false} nodesConnectable={false} elementsSelectable panOnDrag zoomOnScroll>
        <Background gap={20} size={1} />
        <MiniMap pannable zoomable nodeColor={(node) => {
          const data = node.data as unknown as FlowNodeData
          if (data.isActive) return 'var(--accent)'
          if (data.role === 'user') return 'var(--borderAccent,var(--accent))'
          if (data.role === 'toolResult') return 'var(--toolTitle,var(--accent))'
          if (data.role === 'label') return 'rgb(var(--color-cyan))'
          if (data.role === 'branch') return 'rgb(var(--color-purple))'
          if (data.role === 'meta') return 'rgb(var(--color-muted-foreground))'
          return 'rgb(var(--color-muted-foreground))'
        }} maskColor="rgb(var(--color-background) / .62)" nodeStrokeColor="rgb(var(--color-border))" />
      </ReactFlow>
      </div>
      <aside className="psm-graph-inspector">
        <div className="psm-graph-inspector-title"><Network size={13} /><span>{viewMode === 'flow' ? 'Compact Flow' : 'Full Hierarchy'}</span></div>
        <div className="psm-graph-stats"><span>{flowNodes.length} nodes</span><span>{flowEdges.length} links</span><span>{stats.path} path</span>{hiddenCount > 0 ? <span>{hiddenCount} hidden</span> : null}</div>
        {activeData ? <div className="psm-graph-active"><span className={`psm-graph-dot psm-graph-dot-${activeData.role}`} /><span className="psm-graph-active-text">{activeData.label}</span><span className="psm-graph-kind">{activeData.kind}</span></div> : null}
        {activeData ? <div className="psm-graph-jsonl-inspector">
          <div><span>id</span><code>{activeData.entryId}</code></div>
          <div><span>role/type</span><code>{activeData.role} · {activeData.kind}</code></div>
          <div><span>summary</span><code>{activeData.preview || activeData.label}</code></div>
          <div><span>parent</span><code>{activeData.parentId || 'root'}</code></div>
          <div><span>children</span><code>{activeData.childIds.length ? activeData.childIds.join(', ') : '-'}</code></div>
          <div><span>target</span><code>{activeData.targetId || '-'}</code></div>
          <div><span>label</span><code>{activeData.labelTag || '-'}</code></div>
          <div><span>tools</span><code>{activeData.toolSummary || '-'}</code></div>
          <div><span>skipped</span><code>{activeData.skippedIds?.join(', ') || '-'}</code></div>
        </div> : null}
      </aside>
    </div>
  )
}

function SessionGraphCanvas(props: SessionGraphViewProps) {
  const activeId = props.activeEntryId ?? undefined
  const [viewMode, setViewMode] = useState<ViewMode>(props.viewMode)
  const [graphFilter, setGraphFilter] = useState<GraphFilter>('inherit')
  useEffect(() => ensureSessionGraphStyles(), [])
  useEffect(() => setViewMode(props.viewMode), [props.viewMode])
  const roots = useMemo(() => buildTree(props.entries, props.labelsByTargetId ?? {}), [props.entries, props.labelsByTargetId])
  const pathIds = useMemo(() => activePathIds(props.entries, activeId), [props.entries, activeId])
  const owners = useMemo(() => toolCallOwners(props.entries), [props.entries])
  const leafMap = useMemo(() => newestLeafMap(roots), [roots])
  const effectiveFilter = graphFilter === 'inherit' ? (props.filter ?? 'default') : graphFilter
  const { nodes, edges, hiddenCount } = useMemo(() => {
    const limit = viewMode === 'hierarchy' ? MAX_HIERARCHY_NODES : MAX_FLOW_NODES
    const viewRoots = viewMode === 'hierarchy' ? filterTreeForView(roots, effectiveFilter) : roots
    const layout = viewMode === 'hierarchy' ? layoutHierarchy(viewRoots, pathIds, activeId) : layoutFlow(compactTree(roots, effectiveFilter), pathIds, activeId)
    const limited = limitLayout(layout, pathIds, activeId, limit)
    return { nodes: limited.nodes, edges: limited.edges, hiddenCount: layout.nodes.length - limited.nodes.length }
  }, [activeId, effectiveFilter, pathIds, roots, viewMode])

  const byId = useMemo(() => new Map(props.entries.map((entry) => [entry.id, entry])), [props.entries])
  const handleNodeClick = useCallback((_: MouseEvent, node: Node) => {
    if (!props.onNavigate) return
    const entry = byId.get(node.id)
    const targetId = entry ? resolveTarget(entry, owners) : node.id
    const leafId = targetId === node.id ? node.id : (leafMap.get(node.id) ?? node.id)
    props.onNavigate(leafId, targetId)
  }, [byId, leafMap, owners, props])

  return (
    <ReactFlowProvider>
      <GraphInner nodes={nodes} edges={edges} activeEntryId={props.activeEntryId} hiddenCount={hiddenCount} viewMode={viewMode} onViewModeChange={setViewMode} graphFilter={graphFilter} onFilterChange={setGraphFilter} onNodeClick={handleNodeClick} />
    </ReactFlowProvider>
  )
}

export default memo(SessionGraphCanvas)
