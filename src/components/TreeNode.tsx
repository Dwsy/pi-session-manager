import type { SessionEntry } from '../types'

interface TreeNodeProps {
  entry: SessionEntry
  level: number
  isActive: boolean
  isTarget: boolean
  onClick: () => void
}

export interface FlatTreeNode {
  entry: SessionEntry
  level: number
  isActive: boolean
  isTarget: boolean
  newestLeafId?: string
}

function TreeNodeDisplay({ entry }: { entry: SessionEntry }) {
  if (entry.type === 'message' && entry.message) {
    const role = entry.message.role
    const content = entry.message.content || []

    const textItems = content.filter(c => c.type === 'text')
    const text = textItems.map(c => c.text).join(' ').substring(0, 100)

    const toolCalls = content.filter(c => c.type === 'toolCall')

    if (role === 'user') {
      return <span className="tree-role-user">User: {text || '(empty)'}</span>
    } else if (role === 'assistant') {
      const parts = []
      if (text) parts.push(text)
      if (toolCalls.length > 0) parts.push(`[${toolCalls.length} tool call${toolCalls.length > 1 ? 's' : ''}]`)
      return <span className="tree-role-assistant">Assistant: {parts.join(' ') || '(empty)'}</span>
    } else if (role === 'toolResult') {
      return <span className="tree-role-tool">Tool Result</span>
    }
  } else if (entry.type === 'model_change') {
    return <span>Model: {entry.provider}/{entry.modelId}</span>
  } else if (entry.type === 'compaction') {
    return <span className="tree-compaction">Compaction ({entry.tokensBefore} tokens)</span>
  } else if (entry.type === 'branch_summary') {
    return <span className="tree-branch-summary">Branch Summary</span>
  } else if (entry.type === 'custom_message') {
    return <span className="tree-custom-message">[{entry.customType}]</span>
  } else if (entry.type === 'session') {
    return <span>Session Start</span>
  }

  return <span className="tree-muted">{entry.type}</span>
}

export default function TreeNode({ entry, level, isActive, isTarget, onClick }: TreeNodeProps) {
  let prefix = ''
  for (let i = 0; i < level; i++) {
    prefix += '│  '
  }
  if (level > 0) {
    prefix += '├── '
  }

  const marker = isActive ? '•' : '·'

  const handleClick = () => {
    onClick()
  }

  return (
    <div
      className={`tree-node ${isTarget ? 'active' : ''} ${isActive ? 'in-path' : ''}`}
      onClick={handleClick}
    >
      <span className="tree-prefix">{prefix}</span>
      <span className="tree-marker">{marker}</span>
      <span className="tree-content">
        <TreeNodeDisplay entry={entry} />
      </span>
    </div>
  )
}