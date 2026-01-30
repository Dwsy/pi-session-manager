import { useState, useMemo } from 'react'
import type { SessionEntry } from '../types'
import TreeNode from './TreeNode'

interface SessionTreeProps {
  entries: SessionEntry[]
  activeLeafId?: string
  targetId?: string
  onNodeClick?: (leafId: string, targetId: string) => void
  filter?: 'default' | 'no-tools' | 'user-only' | 'labeled-only' | 'all'
}

interface TreeNodeData {
  entry: SessionEntry
  children: TreeNodeData[]
  label?: string
}

export default function SessionTree({
  entries,
  activeLeafId,
  targetId,
  onNodeClick,
  filter = 'default'
}: SessionTreeProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [currentFilter, setCurrentFilter] = useState(filter)

  // Build tree structure
  const treeData = useMemo(() => {
    const byId = new Map<string, SessionEntry>()
    const childrenMap = new Map<string, TreeNodeData[]>()

    // Create entry lookup
    for (const entry of entries) {
      byId.set(entry.id, entry)
      childrenMap.set(entry.id, [])
    }

    // Build parent-child relationships
    for (const entry of entries) {
      if (entry.parentId && byId.has(entry.parentId)) {
        const parentNode = childrenMap.get(entry.parentId)
        if (parentNode) {
          parentNode.push({ entry, children: [] })
        }
      }
    }

    // Find root nodes (no parent or parent not found)
    const roots: TreeNodeData[] = []
    for (const entry of entries) {
      if (!entry.parentId || !byId.has(entry.parentId)) {
        const node: TreeNodeData = { entry, children: childrenMap.get(entry.id) || [] }
        roots.push(node)
      }
    }

    return roots
  }, [entries])

  // Build active path IDs
  const activePathIds = useMemo(() => {
    if (!activeLeafId) return new Set<string>()

    const pathIds = new Set<string>()
    let currentId = activeLeafId

    while (currentId) {
      pathIds.add(currentId)
      const entry = entries.find(e => e.id === currentId)
      if (entry?.parentId) {
        currentId = entry.parentId
      } else {
        break
      }
    }

    return pathIds
  }, [entries, activeLeafId])

  // Flatten tree for filtering and searching
  const flatNodes = useMemo(() => {
    const nodes: Array<{ node: TreeNodeData; level: number }> = []

    const flatten = (treeNodes: TreeNodeData[], level: number) => {
      for (const node of treeNodes) {
        nodes.push({ node, level })
        if (node.children.length > 0) {
          flatten(node.children, level + 1)
        }
      }
    }

    flatten(treeData, 0)
    return nodes
  }, [treeData])

  // Filter nodes
  const filteredNodes = useMemo(() => {
    const isSettingsEntry = (entry: SessionEntry) => {
      if (entry.type === 'message' && entry.message?.role === 'assistant') {
        const content = entry.message.content || []
        return content.some((c: any) => c.type === 'text' && c.text?.trim() === '')
      }
      return false
    }

    return flatNodes.filter(({ node }) => {
      const entry = node.entry

      // Search filter
      if (searchQuery) {
        const text = getNodeDisplayText(entry)
        if (!text.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false
        }
      }

      // Type filter
      switch (currentFilter) {
        case 'default':
          // Hide settings entries
          return !isSettingsEntry(entry)

        case 'no-tools':
          // Default minus tool results
          if (entry.type === 'message' && entry.message?.role === 'toolResult') {
            return false
          }
          return !isSettingsEntry(entry)

        case 'user-only':
          return entry.type === 'message' && entry.message?.role === 'user'

        case 'labeled-only':
          // Only entries with labels
          return !!node.label

        case 'all':
          return true

        default:
          return true
      }
    })
  }, [flatNodes, searchQuery, currentFilter, entries])

  // Find newest leaf for a node
  const findNewestLeaf = (entryId: string): string => {
    const entry = entries.find(e => e.id === entryId)
    if (!entry) return entryId

    // If this is a message, it's a leaf
    if (entry.type === 'message') {
      return entryId
    }

    // Otherwise, find the newest leaf in its subtree
    let newestLeaf = entryId
    let newestTime = entry.timestamp || ''

    for (const e of entries) {
      if (e.parentId === entryId && e.type === 'message') {
        if (e.timestamp && e.timestamp > newestTime) {
          newestTime = e.timestamp
          newestLeaf = e.id
        }
      }
    }

    return newestLeaf
  }

  const handleNodeClick = (entry: SessionEntry) => {
    const leafId = findNewestLeaf(entry.id)
    onNodeClick?.(leafId, entry.id)
  }

  return (
    <div className="session-tree">
      {/* Header */}
      <div className="tree-header">
        <div className="tree-controls">
          <input
            type="text"
            className="tree-search"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="tree-filters">
          <button
            className={`filter-btn ${currentFilter === 'default' ? 'active' : ''}`}
            onClick={() => setCurrentFilter('default')}
            title="Hide settings entries"
          >
            Default
          </button>
          <button
            className={`filter-btn ${currentFilter === 'no-tools' ? 'active' : ''}`}
            onClick={() => setCurrentFilter('no-tools')}
            title="Default minus tool results"
          >
            No-tools
          </button>
          <button
            className={`filter-btn ${currentFilter === 'user-only' ? 'active' : ''}`}
            onClick={() => setCurrentFilter('user-only')}
            title="Only user messages"
          >
            User
          </button>
          <button
            className={`filter-btn ${currentFilter === 'labeled-only' ? 'active' : ''}`}
            onClick={() => setCurrentFilter('labeled-only')}
            title="Only labeled entries"
          >
            Labeled
          </button>
          <button
            className={`filter-btn ${currentFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCurrentFilter('all')}
            title="Show everything"
          >
            All
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="tree-container">
        {filteredNodes.map(({ node, level }) => {
          const isActive = activePathIds.has(node.entry.id)
          const isTarget = node.entry.id === targetId

          return (
            <TreeNode
              key={node.entry.id}
              entry={node.entry}
              level={level}
              isActive={isActive}
              isTarget={isTarget}
              onClick={() => handleNodeClick(node.entry)}
            />
          )
        })}
      </div>

      {/* Status */}
      <div className="tree-status">
        {filteredNodes.length} / {flatNodes.length} entries
      </div>
    </div>
  )
}

function getNodeDisplayText(entry: SessionEntry): string {
  if (entry.type === 'message' && entry.message) {
    const msg = entry.message
    const content = msg.content || []

    if (msg.role === 'user') {
      const textItems = content.filter((c: any) => c.type === 'text' && c.text)
      return textItems.map((c: any) => c.text).join('\n').substring(0, 100)
    } else if (msg.role === 'assistant') {
      const textItems = content.filter((c: any) => c.type === 'text' && c.text)
      return textItems.map((c: any) => c.text).join('\n').substring(0, 100)
    }
  }

  return ''
}