import type { SessionEntry } from "@/types"

export interface TreeNodeData {
  entry: SessionEntry
  children: TreeNodeData[]
  label?: string
}

export interface FlatNode {
  node: TreeNodeData
  indent: number
  showConnector: boolean
  isLast: boolean
  gutters: Array<{ position: number; show: boolean }>
  isVirtualRootChild: boolean
  multipleRoots: boolean
}

export function isNoneParent(pid: unknown): boolean {
  return pid == null || pid === "None" || pid === "null" || pid === "NONE"
}

export function buildTree(entries: SessionEntry[]): TreeNodeData[] {
  const byId = new Map<string, SessionEntry>()
  const cm = new Map<string, TreeNodeData[]>()
  const labelMap = new Map<string, string>()
  for (const e of entries) { byId.set(e.id, e); cm.set(e.id, []); }
  for (const e of entries) { if (e.type === "label" && e.targetId && e.label) labelMap.set(e.targetId, e.label); }

  // Build parent-child links. If parent not in entries, treat entry as root.
  for (const e of entries) {
    const ep = isNoneParent(e.parentId) ? null : e.parentId
    if (ep && byId.has(ep)) {
      cm.get(ep)!.push({ entry: e, children: cm.get(e.id)!, label: labelMap.get(e.id) })
    }
    // If parent is null or parent not in entries, entry becomes a root (handled below)
  }

  const roots: TreeNodeData[] = []
  for (const e of entries) {
    const ep = isNoneParent(e.parentId) ? null : e.parentId
    if (!ep || !byId.has(ep)) roots.push({ entry: e, children: cm.get(e.id)!, label: labelMap.get(e.id) })
  }

  const sort = (n: TreeNodeData) => {
    n.children.sort((a, b) => new Date(a.entry.timestamp || 0).getTime() - new Date(b.entry.timestamp || 0).getTime())
    n.children.forEach(sort)
  }
  roots.forEach(sort)
  return roots
}

export function flattenTree(roots: TreeNodeData[], _activePathIds: Set<string>): FlatNode[] {
  const result: FlatNode[] = []
  const multipleRoots = roots.length > 1

  type StackItem = [TreeNodeData, number, boolean, boolean, boolean, Array<{ position: number; show: boolean }>, boolean]
  const stack: StackItem[] = []
  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push([roots[i], multipleRoots ? 1 : 0, multipleRoots, multipleRoots, i === roots.length - 1, [], multipleRoots])
  }

  while (stack.length > 0) {
    const [node, indent, justBranched, showConnector, isLast, gutters, isVirtualRootChild] = stack.pop()!
    result.push({ node, indent, showConnector, isLast, gutters, isVirtualRootChild, multipleRoots })

    const children = node.children
    const multipleChildren = children.length > 1
    const childIndent = multipleChildren ? indent + 1 : (justBranched && indent > 0 ? indent + 1 : indent)
    const conn = showConnector && !isVirtualRootChild
    const disp = multipleRoots ? Math.max(0, indent - 1) : indent
    const pos = Math.max(0, disp - 1)
    const childGutters = conn ? [...gutters, { position: pos, show: !isLast }] : gutters

    for (let i = children.length - 1; i >= 0; i--) {
      stack.push([children[i], childIndent, multipleChildren, multipleChildren, i === children.length - 1, childGutters, false])
    }
  }
  return result
}

export function buildActivePathIds(activeLeafId: string | null | undefined, entries: SessionEntry[]): Set<string> {
  if (!activeLeafId) return new Set()
  const byId = new Map<string, SessionEntry>()
  for (const e of entries) byId.set(e.id, e)

  const ids = new Set<string>()
  let cur: string | undefined = activeLeafId
  while (cur) {
    ids.add(cur)
    const e = byId.get(cur)
    if (!e) break
    const pid = e.parentId
    if (isNoneParent(pid) || pid === e.id) break
    const parent = byId.get(pid as string)
    if (parent) { cur = parent.id }
    else { const idx = entries.findIndex(x => x.id === cur); if (idx > 0) cur = entries[idx - 1]?.id; else break; }
  }
  return ids
}

export function findNewestLeaf(treeData: TreeNodeData[]): Map<string, string> {
  const map = new Map<string, string>()
  const walk = (n: TreeNodeData): string => {
    let leaf = n.entry.id
    for (const c of n.children) walk(c)
    if (n.children.length > 0) {
      const lc = n.children[n.children.length - 1]
      leaf = map.get(lc.entry.id) || lc.entry.id
    }
    map.set(n.entry.id, leaf)
    return leaf
  }
  treeData.forEach(walk)
  return map
}

export function filterFlatNodes(
  flatNodes: FlatNode[],
  searchTerms: string[],
  currentFilter: string,
  extractContent: (c: unknown) => string,
): FlatNode[] {
  const isSettings = (e: SessionEntry) =>
    ["session", "session_info", "label", "model_change", "thinking_level_change"].includes(e.type)

  const baseFiltered = flatNodes.filter(fn => {
    const entry = fn.node.entry
    if (searchTerms.length > 0) {
      const parts: string[] = []
      if (entry.type === "message" && entry.message) {
        parts.push(entry.message.role)
        if (entry.message.content) parts.push(extractContent(entry.message.content))
      }
      if (entry.type === "compaction") parts.push("compaction")
      if (entry.type === "branch_summary") parts.push(entry.summary || "")
      if (entry.type === "model_change") parts.push(entry.modelId || "")
      if (!searchTerms.every(t => parts.join(" ").toLowerCase().includes(t))) return false
    }
    switch (currentFilter) {
      case "user-only": return entry.type === "message" && entry.message?.role === "user"
      case "no-tools": if (entry.type === "message" && entry.message?.role === "toolResult") return false; return !isSettings(entry)
      case "default": return !isSettings(entry)
      case "labeled-only": return !!fn.node.label
      case "all": return true
      default:
        if (currentFilter.startsWith("tool-")) {
          const tn = currentFilter.slice(5)
          if (entry.type === "message" && entry.message?.role === "assistant") {
            const c = Array.isArray(entry.message.content) ? entry.message.content : []
            return c.some((x: any) => x.type === "toolCall" && x.name === tn)
          }
          return false
        }
        return true
    }
  })

  if (searchTerms.length > 0 || currentFilter !== "no-tools") {
    return recalculateVisualStructure(baseFiltered, flatNodes)
  }
  return baseFiltered
}

export function recalculateVisualStructure(filteredNodes: FlatNode[], allFlatNodes: FlatNode[]): FlatNode[] {
  if (filteredNodes.length === 0) return filteredNodes
  const visibleIds = new Set(filteredNodes.map(n => n.node.entry.id))
  const entryMap = new Map<string, FlatNode>()
  for (const fn of allFlatNodes) entryMap.set(fn.node.entry.id, fn)

  const findVisibleAncestor = (nid: string): string | null => {
    let cid: string | undefined = entryMap.get(nid)?.node.entry.parentId
    while (cid != null) {
      if (visibleIds.has(cid)) return cid
      cid = entryMap.get(cid)?.node.entry.parentId
    }
    return null
  }

  const visibleChildren = new Map<string | null, string[]>()
  visibleChildren.set(null, [])
  for (const fn of filteredNodes) {
    const nid = fn.node.entry.id
    const aid = findVisibleAncestor(nid)
    if (!visibleChildren.has(aid ?? null)) visibleChildren.set(aid ?? null, [])
    visibleChildren.get(aid ?? null)!.push(nid)
  }

  const visibleRootIds = visibleChildren.get(null) ?? []
  const mr = visibleRootIds.length > 1
  const fMap = new Map<string, FlatNode>()
  for (const fn of filteredNodes) fMap.set(fn.node.entry.id, fn)

  type StackItem = [string, number, boolean, boolean, boolean, Array<{ position: number; show: boolean }>, boolean]
  const stack: StackItem[] = []
  for (let i = visibleRootIds.length - 1; i >= 0; i--) {
    stack.push([visibleRootIds[i], mr ? 1 : 0, mr, mr, i === visibleRootIds.length - 1, [], mr])
  }
  while (stack.length > 0) {
    const [nid, indent, justBranched, showConnector, isLast, gutters, isVirtualRootChild] = stack.pop()!
    const fn = fMap.get(nid); if (!fn) continue
    fn.indent = indent; fn.showConnector = showConnector; fn.isLast = isLast
    fn.gutters = gutters; fn.isVirtualRootChild = isVirtualRootChild; fn.multipleRoots = mr

    const children = visibleChildren.get(nid) ?? []
    const mc = children.length > 1
    const ci = mc ? indent + 1 : (justBranched && indent > 0 ? indent + 1 : indent)
    const conn = showConnector && !isVirtualRootChild
    const disp = mr ? Math.max(0, indent - 1) : indent
    const pos = Math.max(0, disp - 1)
    const cg = conn ? [...gutters, { position: pos, show: !isLast }] : gutters
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push([children[i], ci, mc, mc, i === children.length - 1, cg, false])
    }
  }
  return filteredNodes
}

export function buildTreePrefix(fn: FlatNode): string {
  const { indent, showConnector, isLast, gutters, isVirtualRootChild, multipleRoots } = fn
  const disp = multipleRoots ? Math.max(0, indent - 1) : indent
  const conn = showConnector && !isVirtualRootChild ? (isLast ? "└─ " : "├─ ") : ""
  const cp = conn ? disp - 1 : -1
  const chars: string[] = []
  for (let i = 0; i < disp * 3; i++) {
    const lv = Math.floor(i / 3), pi2 = i % 3
    const g = gutters.find(x => x.position === lv)
    if (g) chars.push(pi2 === 0 ? (g.show ? "│" : " ") : " ")
    else if (conn && lv === cp) chars.push(pi2 === 0 ? (isLast ? "└" : "├") : pi2 === 1 ? "─" : " ")
    else chars.push(" ")
  }
  return chars.join("")
}

export function getEntryDisplayText(e: SessionEntry, label?: string): string {
  if (label) return label
  const trunc = (s: string, m = 100) => s.length <= m ? s : s.slice(0, m) + "..."
  const extractContent = (c: unknown): string => {
    if (typeof c === "string") return c
    if (Array.isArray(c)) return c.filter((x: any) => x.type === "text" && x.text).map((x: any) => x.text).join("")
    return ""
  }
  if (e.type === "message" && e.message) {
    if (e.message.role === "user") { const t = extractContent(e.message.content); return trunc(t) || "User" }
    if (e.message.role === "assistant") {
      const c = Array.isArray(e.message.content) ? e.message.content : []
      const tc = c.find((x: any) => x.type === "toolCall") as { name?: string; arguments?: unknown } | undefined
      if (tc?.name) {
        const a = tc.arguments as Record<string, unknown> | undefined
        const p = a?.path || a?.file_path || ""
        const cmd = a?.command || ""
        return `${tc.name}: ${trunc(String(p || cmd), 50)}`
      }
      return trunc(extractContent(e.message.content)) || "Assistant"
    }
    if (e.message.role === "toolResult") return "tool result"
  }
  if (e.type === "model_change") return `Model: ${e.modelId}`
  if (e.type === "compaction") return "Compaction"
  if (e.type === "custom_message") return e.customType || "Custom"
  return e.type
}

export function getEntryRoleClass(e: SessionEntry): string {
  if (e.type === "message" && e.message?.role === "user") return "tree-role-user"
  if (e.type === "message" && e.message?.role === "assistant") return "tree-role-assistant"
  if (e.type === "message" && e.message?.role === "toolResult") return "tree-role-tool"
  if (e.type === "compaction") return "tree-compaction"
  return "tree-muted"
}

export function getEntryToolName(e: SessionEntry): string | null {
  if (e.type !== "message" || e.message?.role !== "assistant") return null
  const c = Array.isArray(e.message.content) ? e.message.content : []
  return (c.find((x: any) => x.type === "toolCall") as { name?: string } | undefined)?.name || null
}
