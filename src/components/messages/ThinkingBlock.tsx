import { Brain, ChevronDown, ChevronRight } from 'lucide-react'
import { memo, useEffect, useState } from 'react'
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
    <div className={`thinking-block ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="thinking-toggle"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="thinking-toggle-chevron" aria-hidden="true" />
        ) : (
          <ChevronRight className="thinking-toggle-chevron" aria-hidden="true" />
        )}
        <Brain className="thinking-toggle-icon" aria-hidden="true" />
        <span className="thinking-toggle-label">Thinking</span>
        <span className="thinking-toggle-hint">{expanded ? 'Hide' : 'Show reasoning'}</span>
      </button>
      {expanded ? (
        <div className="thinking-text">
          <MarkdownContent content={content} searchQuery={searchQuery} />
        </div>
      ) : null}
    </div>
  )
}

export default memo(ThinkingBlock)
