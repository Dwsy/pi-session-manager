import { useEffect, useRef } from 'react'
import { parseMarkdown } from '../utils/markdown'
import { highlightSearchInHTML } from '../utils/search'

interface MarkdownContentProps {
  content: string
  className?: string
  searchQuery?: string
}

export default function MarkdownContent({ content, className = '', searchQuery = '' }: MarkdownContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      let html = parseMarkdown(content)
      if (searchQuery) {
        html = highlightSearchInHTML(html, searchQuery)
      }
      containerRef.current.innerHTML = html
    }
  }, [content, searchQuery])

  return (
    <div
      ref={containerRef}
      className={`markdown-content ${className}`}
    />
  )
}