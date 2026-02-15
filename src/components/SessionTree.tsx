import { useState, useMemo, useCallback, useEffect, forwardRef, useRef, useImperativeHandle, lazy, Suspense, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { SessionEntry } from '../types'
import SessionTreeSearch, { type SessionTreeSearchRef } from './SessionTreeSearch'

const SessionFlowView = lazy(() => import('./SessionFlowView'))

// 高亮搜索关键词
function highlightText(text: string, tokens: string[]): ReactNode {
  if (!tokens.length || !text) return text

  const regex = new RegExp(`(${tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts = text.split(regex)

  return parts.map((part, i) => {
    const isMatch = tokens.some(t => part.toLowerCase() === t.toLowerCase())
    return isMatch ? <mark key={i} className="search-keyword">{part}</mark> : part
  })
}

// 提取匹配摘要
function extractSnippet(text: string, tokens: string[], maxLen = 60): string | null {
  if (!text || !tokens.length) return null

  const lowerText = text.toLowerCase()
  let firstMatchIdx = -1

  for (const token of tokens) {
    const idx = lowerText.indexOf(token.toLowerCase())
    if (idx !== -1 && (firstMatchIdx === -1 || idx < firstMatchIdx)) {
      firstMatchIdx = idx
    }
  }

  if (firstMatchIdx === -1) return null

  const start = Math.max(0, firstMatchIdx - 20)
  const end = Math.min(text.length, firstMatchIdx + maxLen)
  let snippet = text.slice(start, end).trim()

  if (start > 0) snippet = '...' + snippet
  if (end < text.length) snippet = snippet + '...'

  return snippet
}

export interface SessionTreeRef {
  focusSearch: () => void
}

interface SessionTreeProps {
  entries: SessionEntry[]
  activeLeafId?: string
  onNodeClick?: (leafId: string, targetId: string) => void
  filter?: 'default' | 'no-tools' | 'user-only' | 'labeled-only' | 'all' | 'read-tools' | 'edit-tools' | 'write-tools'
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
  hasChildren: boolean
  isBranchPoint: boolean
}

const SessionTree = forwardRef<SessionTreeRef, SessionTreeProps>(function SessionTree({
  entries,
  activeLeafId,
  onNodeClick,
  filter = 'no-tools'
}: SessionTreeProps,
ref
) {
  const { t } = useTranslation()
  const searchRef = useRef<SessionTreeSearchRef>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentFilter, setCurrentFilter] = useState(filter)
  const [currentResultIndex, setCurrentResultIndex] = useState(0)
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<'tree' | 'flow'>('tree')

  useImperativeHandle(ref, () => ({
    focusSearch: () => {
      searchRef.current?.focus()
    }
  }))

  const toggleCollapse = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCollapsedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

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
      const hasChildren = node.children.length > 0
      const isBranchPoint = node.children.length > 1

      result.push({ node, indent, showConnector, isLast, gutters, isVirtualRootChild, multipleRoots, hasChildren, isBranchPoint })

      // 如果当前节点被折叠，跳过子节点
      if (collapsedNodes.has(node.entry.id)) {
        continue
      }

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
  }, [treeData, activePathIds, collapsedNodes])

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

        case 'read-tools':
          if (entry.type === 'message' && entry.message?.role === 'assistant') {
            const content = Array.isArray(entry.message.content) ? entry.message.content : []
            return content.some((c: any) => c.type === 'toolCall' && c.name === 'read')
          }
          return false

        case 'edit-tools':
          if (entry.type === 'message' && entry.message?.role === 'assistant') {
            const content = Array.isArray(entry.message.content) ? entry.message.content : []
            return content.some((c: any) => c.type === 'toolCall' && c.name === 'edit')
          }
          return false

        case 'write-tools':
          if (entry.type === 'message' && entry.message?.role === 'assistant') {
            const content = Array.isArray(entry.message.content) ? entry.message.content : []
            return content.some((c: any) => c.type === 'toolCall' && c.name === 'write')
          }
          return false

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
          
          if (toolCalls.length > 0) {
            // 显示第一个工具调用的名称和参数
            const firstTool = toolCalls[0]
            const toolName = firstTool.name || 'unknown'
            
            // 根据工具类型显示不同的信息
            if (toolName === 'bash') {
              const command = firstTool.arguments?.command || ''
              const shortCmd = command.length > 30 ? command.slice(0, 30) + '...' : command
              return `bash: ${shortCmd}`
            } else if (toolName === 'read') {
              const path = firstTool.arguments?.path || firstTool.arguments?.file_path || ''
              const fileName = path.split('/').pop() || path
              return `read: ${fileName}`
            } else if (toolName === 'write') {
              const path = firstTool.arguments?.path || firstTool.arguments?.file_path || ''
              const fileName = path.split('/').pop() || path
              return `write: ${fileName}`
            } else if (toolName === 'edit') {
              const path = firstTool.arguments?.path || firstTool.arguments?.file_path || ''
              const fileName = path.split('/').pop() || path
              return `edit: ${fileName}`
            } else {
              // 其他工具显示工具名称
              return `${toolName}${toolCalls.length > 1 ? ` +${toolCalls.length - 1}` : ''}`
            }
          }
          
          return 'Assistant'
        } else if (msg.role === 'toolResult') {
          // 显示工具结果的相关信息
          const content = Array.isArray(msg.content) ? msg.content : []
          const toolResultContent = content.find((c: any) => c.type === 'toolResult')
          
          if (toolResultContent && toolResultContent.id) {
            // 尝试找到对应的工具调用
            const toolCallEntry = entries.find(e => 
              e.type === 'message' && 
              e.message?.role === 'assistant' &&
              Array.isArray(e.message.content) &&
              e.message.content.some((c: any) => c.type === 'toolCall' && c.id === toolResultContent.id)
            )
            
            if (toolCallEntry && toolCallEntry.message) {
              const toolCall = (toolCallEntry.message.content as any[]).find(
                (c: any) => c.type === 'toolCall' && c.id === toolResultContent.id
              )
              
              if (toolCall) {
                const toolName = toolCall.name || 'unknown'
                const hasError = msg.errorMessage || msg.exitCode !== undefined && msg.exitCode !== 0
                const status = hasError ? ' ✗' : ' ✓'
                return `${toolName} result${status}`
              }
            }
          }
          
          const hasError = msg.errorMessage || msg.exitCode !== undefined && msg.exitCode !== 0
          return hasError ? 'tool result ✗' : 'tool result ✓'
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

  // 获取完整文本用于摘要
  const getFullText = (entry: SessionEntry, label?: string): string => {
    const parts: string[] = []
    if (label) parts.push(label)

    switch (entry.type) {
      case 'message': {
        const msg = entry.message
        if (msg?.content) {
          if (Array.isArray(msg.content)) {
            msg.content.forEach((c: any) => {
              if (c.type === 'text' && c.text) parts.push(c.text)
            })
          } else if (typeof msg.content === 'string') {
            parts.push(msg.content)
          }
        }
        break
      }
      case 'custom_message':
        if (typeof entry.content === 'string') parts.push(entry.content)
        break
      case 'branch_summary':
        if (entry.summary) parts.push(entry.summary)
        break
    }
    return parts.join(' ')
  }

  // 计算搜索结果列表
  const matchedEntryIds = useMemo(() => {
    if (!searchQuery.trim()) return []
    
    const searchTokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean)
    const matched: string[] = []
    
    flatNodes.forEach(flatNode => {
      const entry = flatNode.node.entry
      const label = flatNode.node.label
      
      const parts: string[] = []
      if (label) parts.push(label)
      
      switch (entry.type) {
        case 'message': {
          const msg = entry.message
          if (msg) {
            parts.push(msg.role)
            if (msg.content) {
              const content = Array.isArray(msg.content)
                ? msg.content.filter((c: any) => c.type === 'text' && c.text).map((c: any) => c.text).join('')
                : msg.content
              parts.push(content)
            }
          }
          break
        }
        case 'custom_message':
          parts.push(entry.customType || '')
          parts.push(typeof entry.content === 'string' ? entry.content : '')
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
      
      const text = parts.join(' ').toLowerCase()
      if (searchTokens.every(token => text.includes(token))) {
        matched.push(entry.id)
      }
    })
    
    return matched
  }, [flatNodes, searchQuery])

  // 更新搜索结果
  useEffect(() => {
    setSearchResults(matchedEntryIds)
    setCurrentResultIndex(0)
  }, [matchedEntryIds])



  // toolResult 不会单独渲染，需要跳转到对应的 assistant 消息（包含该 toolCall）
  const resolveScrollTarget = useCallback((entryId: string): string => {
    const entry = entries.find(e => e.id === entryId)
    if (!entry || entry.type !== 'message' || entry.message?.role !== 'toolResult') {
      return entryId
    }
    const content = Array.isArray(entry.message.content) ? entry.message.content : []
    const toolResultContent = content.find((c: any) => c.type === 'toolResult')
    if (!toolResultContent?.id) return entryId

    const assistantEntry = entries.find(e =>
      e.type === 'message' &&
      e.message?.role === 'assistant' &&
      Array.isArray(e.message.content) &&
      e.message.content.some((c: any) => c.type === 'toolCall' && c.id === toolResultContent.id)
    )
    return assistantEntry ? assistantEntry.id : entryId
  }, [entries])

  // 搜索导航
  const handleSearchNext = useCallback(() => {
    if (searchResults.length === 0) return
    const newIndex = (currentResultIndex + 1) % searchResults.length
    setCurrentResultIndex(newIndex)
    const entryId = searchResults[newIndex]
    if (onNodeClick) {
      onNodeClick(entryId, resolveScrollTarget(entryId))
    }
  }, [searchResults, currentResultIndex, onNodeClick, resolveScrollTarget])

  const handleSearchPrevious = useCallback(() => {
    if (searchResults.length === 0) return
    const newIndex = (currentResultIndex - 1 + searchResults.length) % searchResults.length
    setCurrentResultIndex(newIndex)
    const entryId = searchResults[newIndex]
    if (onNodeClick) {
      onNodeClick(entryId, resolveScrollTarget(entryId))
    }
  }, [searchResults, currentResultIndex, onNodeClick, resolveScrollTarget])

  const handleSearchClose = useCallback(() => {
    setSearchQuery('')
    setSearchResults([])
    setCurrentResultIndex(0)
  }, [])

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  // Find the newest leaf reachable from a given node (follow last child at each level)
  const findNewestLeaf = useCallback((nodeId: string): string => {
    // Build a lookup from treeData
    const nodeMap = new Map<string, TreeNodeData>()
    function mapNodes(node: TreeNodeData) {
      nodeMap.set(node.entry.id, node)
      node.children.forEach(mapNodes)
    }
    treeData.forEach(mapNodes)

    const node = nodeMap.get(nodeId)
    if (!node) return nodeId

    let current = node
    while (current.children.length > 0) {
      current = current.children[current.children.length - 1]
    }
    return current.entry.id
  }, [treeData])

  const handleNodeClick = (flatNode: FlatNode) => {
    const entry = flatNode.node.entry
    const leafId = findNewestLeaf(entry.id)
    const scrollTargetId = resolveScrollTarget(entry.id)

    if (onNodeClick) {
      onNodeClick(leafId, scrollTargetId)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <SessionTreeSearch
        ref={searchRef}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onClear={handleSearchClose}
        onNext={handleSearchNext}
        onPrevious={handleSearchPrevious}
        currentIndex={currentResultIndex}
        totalResults={searchResults.length}
      />

      {/* View mode toggle */}
      <div className="sidebar-filters sidebar-filters-view-mode">
        <button
          className={`filter-btn ${viewMode === 'tree' ? 'active' : ''}`}
          onClick={() => setViewMode('tree')}
        >
          Tree
        </button>
        <button
          className={`filter-btn ${viewMode === 'flow' ? 'active' : ''}`}
          onClick={() => setViewMode('flow')}
        >
          Flow
        </button>
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
        <button
          className={`filter-btn ${currentFilter === 'read-tools' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('read-tools')}
        >
          Read
        </button>
        <button
          className={`filter-btn ${currentFilter === 'edit-tools' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('edit-tools')}
        >
          Edit
        </button>
        <button
          className={`filter-btn ${currentFilter === 'write-tools' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('write-tools')}
        >
          Write
        </button>
      </div>

      {viewMode === 'flow' ? (
        <div className="flex-1 min-h-0">
          <Suspense fallback={<div style={{ padding: 12, color: 'var(--color-text-secondary)' }}>{t('session.tree.loading')}</div>}>
            <SessionFlowView
              entries={entries}
              activeLeafId={activeLeafId}
              onNodeClick={onNodeClick}
              filter={currentFilter}
            />
          </Suspense>
        </div>
      ) : (
      <>

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
          const isCollapsed = collapsedNodes.has(entry.id)

          const isSearchMatch = searchResults.includes(entry.id)
          const isCurrentMatch = isSearchMatch && searchResults[currentResultIndex] === entry.id
          const searchTokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean)

          let snippet: string | null = null
          if (isSearchMatch && searchQuery) {
            const fullText = getFullText(entry, label)
            snippet = extractSnippet(fullText, searchTokens)
          }

          return (
            <div
              key={`${entry.id}-${index}`}
              className={`tree-node ${isActive ? 'active' : ''} ${isInPath ? 'in-path' : ''} ${isSearchMatch ? 'search-match' : ''} ${isCurrentMatch ? 'search-match-current' : ''}`}
              onClick={() => handleNodeClick(flatNode)}
            >
              <span className="tree-prefix">{prefix}</span>
              {flatNode.isBranchPoint ? (
                <span
                  className="tree-toggle"
                  onClick={(e) => toggleCollapse(entry.id, e)}
                >
                  {isCollapsed ? '▸ ' : '▾ '}
                </span>
              ) : (
                <span className="tree-marker">{marker}</span>
              )}
              <span className={`tree-content ${roleClass}`}>{displayText}</span>
              {isCollapsed && flatNode.isBranchPoint && (
                <span className="tree-collapsed-hint">...</span>
              )}
              {snippet && (
                <span className="tree-snippet">{highlightText(snippet, searchTokens)}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Status */}
      <div className="tree-status">
        {filteredNodes.length} / {flatNodes.length} {t('session.tree.nodes')}
      </div>
      </>
      )}
    </div>
  )
})

export default SessionTree
