import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionEntry } from '../types'

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

interface FlatNode {
  node: TreeNodeData
  indent: number
  showConnector: boolean
  isLast: boolean
  gutters: Array<{ position: number; show: boolean }>
  isVirtualRootChild: boolean
  multipleRoots: boolean
}

export default function SessionTree({
  entries,
  activeLeafId,
  targetId,
  onNodeClick,
  filter = 'default'
}: SessionTreeProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [currentFilter, setCurrentFilter] = useState(filter)

  // Build tree structure
  const treeData = useMemo(() => {
    const byId = new Map<string, SessionEntry>()
    const childrenMap = new Map<string, TreeNodeData[]>()

    for (const entry of entries) {
      byId.set(entry.id, entry)
      childrenMap.set(entry.id, [])
    }

    for (const entry of entries) {
      if (entry.parentId && byId.has(entry.parentId)) {
        const parentNode = childrenMap.get(entry.parentId)
        if (parentNode) {
          parentNode.push({ entry, children: childrenMap.get(entry.id) || [] })
        }
      }
    }

    const roots: TreeNodeData[] = []
    for (const entry of entries) {
      if (!entry.parentId || !byId.has(entry.parentId)) {
        const node: TreeNodeData = { entry, children: childrenMap.get(entry.id) || [] }
        roots.push(node)
      }
    }

    // Sort children by timestamp
    function sortChildren(node: TreeNodeData) {
      node.children.sort((a, b) =>
        new Date(a.entry.timestamp || 0).getTime() - new Date(b.entry.timestamp || 0).getTime()
      )
      node.children.forEach(sortChildren)
    }
    roots.forEach(sortChildren)

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
      if (entry?.parentId && entry.parentId !== entry.id) {
        currentId = entry.parentId
      } else {
        break
      }
    }

    return pathIds
  }, [entries, activeLeafId])

  // Flatten tree with proper indentation and connectors
  const flatNodes = useMemo(() => {
    const result: FlatNode[] = []
    const multipleRoots = treeData.length > 1

    // Mark which subtrees contain the active leaf
    const containsActive = new Map<TreeNodeData, boolean>()
    function markActive(node: TreeNodeData): boolean {
      let has = activePathIds.has(node.entry.id)
      for (const child of node.children) {
        if (markActive(child)) has = true
      }
      containsActive.set(node, has)
      return has
    }
    treeData.forEach(markActive)

    // Stack: [node, indent, justBranched, showConnector, isLast, gutters, isVirtualRootChild]
    const stack: Array<[TreeNodeData, number, boolean, boolean, boolean, Array<{ position: number; show: boolean }>, boolean]> = []

    // Add roots (prioritize branch containing active leaf)
    const orderedRoots = [...treeData].sort((a, b) =>
      Number(containsActive.get(b)) - Number(containsActive.get(a))
    )
    for (let i = orderedRoots.length - 1; i >= 0; i--) {
      const isLast = i === orderedRoots.length - 1
      stack.push([orderedRoots[i], multipleRoots ? 1 : 0, multipleRoots, multipleRoots, isLast, [], multipleRoots])
    }

    while (stack.length > 0) {
      const [node, indent, justBranched, showConnector, isLast, gutters, isVirtualRootChild] = stack.pop()!

      result.push({ node, indent, showConnector, isLast, gutters, isVirtualRootChild, multipleRoots })

      const children = node.children
      const multipleChildren = children.length > 1

      // Order children (active branch first)
      const orderedChildren = [...children].sort((a, b) =>
        Number(containsActive.get(b)) - Number(containsActive.get(a))
      )

      // Calculate child indent
      let childIndent: number
      if (multipleChildren) {
        childIndent = indent + 1
      } else if (justBranched && indent > 0) {
        childIndent = indent + 1
      } else {
        childIndent = indent
      }

      // Build gutters for children
      const connectorDisplayed = showConnector && !isVirtualRootChild
      const currentDisplayIndent = multipleRoots ? Math.max(0, indent - 1) : indent
      const connectorPosition = Math.max(0, currentDisplayIndent - 1)
      const childGutters = connectorDisplayed
        ? [...gutters, { position: connectorPosition, show: !isLast }]
        : gutters

      // Add children in reverse order for stack
      for (let i = orderedChildren.length - 1; i >= 0; i--) {
        const childIsLast = i === orderedChildren.length - 1
        stack.push([orderedChildren[i], childIndent, multipleChildren, multipleChildren, childIsLast, childGutters, false])
      }
    }

    return result
  }, [treeData, activePathIds])

  // Build tree prefix (ASCII art)
  const buildTreePrefix = (flatNode: FlatNode): string => {
    const { indent, showConnector, isLast, gutters, isVirtualRootChild, multipleRoots } = flatNode
    const displayIndent = multipleRoots ? Math.max(0, indent - 1) : indent
    const connector = showConnector && !isVirtualRootChild ? (isLast ? '└─ ' : '├─ ') : ''
    const connectorPosition = connector ? displayIndent - 1 : -1

    const totalChars = displayIndent * 3
    const prefixChars: string[] = []
    for (let i = 0; i < totalChars; i++) {
      const level = Math.floor(i / 3)
      const posInLevel = i % 3

      const gutter = gutters.find(g => g.position === level)
      if (gutter) {
        prefixChars.push(posInLevel === 0 ? (gutter.show ? '│' : ' ') : ' ')
      } else if (connector && level === connectorPosition) {
        if (posInLevel === 0) {
          prefixChars.push(isLast ? '└' : '├')
        } else if (posInLevel === 1) {
          prefixChars.push('─')
        } else {
          prefixChars.push(' ')
        }
      } else {
        prefixChars.push(' ')
      }
    }
    return prefixChars.join('')
  }

  // Filter nodes
  const filteredNodes = useMemo(() => {
    const isSettingsEntry = (entry: SessionEntry) => {
      if (entry.type === 'message' && entry.message?.role === 'assistant') {
        const content = entry.message.content || []
        return content.some((c: any) => c.type === 'text' && c.text?.trim() === '')
      }
      return false
    }

    const extractContent = (content: any): string => {
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content
          .filter(c => c.type === 'text' && c.text)
          .map(c => c.text)
          .join('')
      }
      return ''
    }

    const getSearchableText = (entry: SessionEntry, label?: string): string => {
      const parts: string[] = []
      if (label) parts.push(label)

      switch (entry.type) {
        case 'message': {
          const msg = entry.message
          if (msg) {
            parts.push(msg.role)
            if (msg.content) parts.push(extractContent(msg.content))
          }
          break
        }
        case 'custom_message':
          parts.push(entry.customType || '')
          parts.push(typeof entry.content === 'string' ? entry.content : extractContent(entry.content))
          break
        case 'compaction':
          parts.push('compaction')
          break
        case 'branch_summary':
          parts.push('branch summary', entry.summary || '')
          break
        case 'model_change':
          parts.push('model', entry.modelId || '')
          break
      }

      return parts.join(' ').toLowerCase()
    }

    return flatNodes.filter(flatNode => {
      const entry = flatNode.node.entry
      const label = flatNode.node.label

      // Search filter
      if (searchQuery) {
        const searchTokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean)
        const text = getSearchableText(entry, label)
        if (!searchTokens.every(token => text.includes(token))) {
          return false
        }
      }

      // Type filter
      switch (currentFilter) {
        case 'default':
          return !isSettingsEntry(entry)

        case 'no-tools':
          if (entry.type === 'message' && entry.message?.role === 'toolResult') {
            return false
          }
          return !isSettingsEntry(entry)

        case 'user-only':
          return entry.type === 'message' && entry.message?.role === 'user'

        case 'labeled-only':
          return !!label

        case 'all':
          return true

        default:
          return true
      }
    })
  }, [flatNodes, searchQuery, currentFilter])

  // Get node display text
  const getNodeDisplayText = (entry: SessionEntry, label?: string): string => {
    if (label) return label

    switch (entry.type) {
      case 'message': {
        const msg = entry.message
        if (!msg) return 'Unknown'

        if (msg.role === 'user') {
          const content = Array.isArray(msg.content) ? msg.content : []
          const text = content
            .filter((c: any) => c.type === 'text' && c.text)
            .map((c: any) => c.text)
            .join(' ')
          return text.slice(0, 50) || 'User message'
        } else if (msg.role === 'assistant') {
          const toolCalls = Array.isArray(msg.content)
            ? msg.content.filter((c: any) => c.type === 'toolCall')
            : []
          return toolCalls.length > 0 ? `[${toolCalls.length} tool call${toolCalls.length > 1 ? 's' : ''}]` : 'Assistant'
        } else if (msg.role === 'toolResult') {
          return '[tool result]'
        }
        return msg.role
      }
      case 'model_change':
        return `Model: ${entry.modelId}`
      case 'compaction':
        return 'Compaction'
      case 'branch_summary':
        return 'Branch Summary'
      case 'custom_message':
        return entry.customType || 'Custom'
      default:
        return entry.type
    }
  }

  // Get node role class
  const getNodeRoleClass = (entry: SessionEntry): string => {
    switch (entry.type) {
      case 'message': {
        const role = entry.message?.role
        if (role === 'user') return 'tree-role-user'
        if (role === 'assistant') return 'tree-role-assistant'
        if (role === 'toolResult') return 'tree-role-tool'
        return ''
      }
      case 'compaction':
        return 'tree-compaction'
      case 'branch_summary':
        return 'tree-branch-summary'
      case 'custom_message':
        return 'tree-custom-message'
      default:
        return 'tree-muted'
    }
  }

  const handleNodeClick = (flatNode: FlatNode) => {
    const entryId = flatNode.node.entry.id
    if (onNodeClick) {
      onNodeClick(entryId, entryId)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="sidebar-controls">
        <input
          type="text"
          className="sidebar-search"
          placeholder={t('session.tree.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Filters */}
      <div className="sidebar-filters">
        <button
          className={`filter-btn ${currentFilter === 'default' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('default')}
        >
          Default
        </button>
        <button
          className={`filter-btn ${currentFilter === 'no-tools' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('no-tools')}
        >
          No Tools
        </button>
        <button
          className={`filter-btn ${currentFilter === 'user-only' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('user-only')}
        >
          User
        </button>
        <button
          className={`filter-btn ${currentFilter === 'labeled-only' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('labeled-only')}
        >
          Labeled
        </button>
        <button
          className={`filter-btn ${currentFilter === 'all' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('all')}
        >
          All
        </button>
      </div>

      {/* Tree */}
      <div className="tree-container">
        {filteredNodes.map((flatNode, index) => {
          const entry = flatNode.node.entry
          const label = flatNode.node.label
          const isActive = entry.id === activeLeafId
          const isInPath = activePathIds.has(entry.id)
          const prefix = buildTreePrefix(flatNode)
          const marker = isInPath ? '• ' : '· '
          const displayText = getNodeDisplayText(entry, label)
          const roleClass = getNodeRoleClass(entry)

          return (
            <div
              key={`${entry.id}-${index}`}
              className={`tree-node ${isActive ? 'active' : ''} ${isInPath ? 'in-path' : ''}`}
              onClick={() => handleNodeClick(flatNode)}
            >
              <span className="tree-prefix">{prefix}</span>
              <span className="tree-marker">{marker}</span>
              <span className={`tree-content ${roleClass}`}>{displayText}</span>
            </div>
          )
        })}
      </div>

      {/* Status */}
      <div className="tree-status">
        {filteredNodes.length} / {flatNodes.length} {t('session.tree.nodes')}
      </div>
    </div>
  )
}
