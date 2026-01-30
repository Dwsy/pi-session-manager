import { useState } from 'react'
import { escapeHtml } from '../utils/markdown'

interface ThinkingBlockProps {
  content: string
}

export default function ThinkingBlock({ content }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`thinking-block ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
      style={{ cursor: 'pointer' }}
    >
      <div className="thinking-text">{escapeHtml(content)}</div>
      {!expanded && (
        <div className="thinking-collapsed">Thinking ...</div>
      )}
    </div>
  )
}