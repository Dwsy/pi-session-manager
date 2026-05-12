import { memo, useEffect, useState } from 'react'
import { Brain } from 'lucide-react'
import MarkdownContent from '@/components/ui/MarkdownContent'

interface ThinkingBlockProps {
  content: string
  searchQuery?: string
  collapsed?: boolean
}

function ThinkingBlock({ content, searchQuery = '', collapsed = false }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(() => !collapsed)

  useEffect(() => {
    setExpanded(!collapsed)
  }, [collapsed])

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
        <div className="thinking-collapsed">
          <Brain className="h-3.5 w-3.5" />
          <span>Thinking ...</span>
        </div>
      )}
    </div>
  )
}

export default memo(ThinkingBlock)