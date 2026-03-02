import { memo, useState } from 'react'
import MarkdownContent from './MarkdownContent'

interface ThinkingBlockProps {
  content: string
}

function ThinkingBlock({ content }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`thinking-block ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
      style={{ cursor: 'pointer' }}
    >
      <div className="thinking-text">
        <MarkdownContent content={content} />
      </div>
      {!expanded && (
        <div className="thinking-collapsed">Thinking ...</div>
      )}
    </div>
  )
}

export default memo(ThinkingBlock)