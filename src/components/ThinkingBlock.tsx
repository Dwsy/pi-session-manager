import { memo, useState } from 'react'
import MarkdownContent from './MarkdownContent'

interface ThinkingBlockProps {
  content: string
  searchQuery?: string
}

function ThinkingBlock({ content, searchQuery = '' }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`thinking-block ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
      style={{ cursor: 'pointer' }}
    >
      <div className="thinking-text">
        <MarkdownContent content={content} searchQuery={searchQuery} />
      </div>
      {!expanded && (
        <div className="thinking-collapsed">Thinking ...</div>
      )}
    </div>
  )
}

export default memo(ThinkingBlock)