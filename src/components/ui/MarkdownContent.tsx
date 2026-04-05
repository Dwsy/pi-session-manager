import { memo, useMemo } from 'react'
import { parseMarkdown } from '../../utils/markdown'
import { highlightSearchInHTML } from '../../utils/search'

interface MarkdownContentProps {
  content: string
  className?: string
  searchQuery?: string
}

/**
 * Markdown content rendering component
 * Uses useMemo to cache parsed results and avoid repeated computation
 * Uses dangerouslySetInnerHTML instead of direct DOM manipulation
 */
function MarkdownContent({ content, className = '', searchQuery = '' }: MarkdownContentProps) {
  // Cache parsed HTML with useMemo to avoid recalculation
  const html = useMemo(() => {
    let parsed = parseMarkdown(content)
    if (searchQuery) {
      parsed = highlightSearchInHTML(parsed, searchQuery)
    }
    return parsed
  }, [content, searchQuery])

  return (
    <div
      className={`markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default memo(MarkdownContent)
