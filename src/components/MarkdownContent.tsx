import { useEffect, useRef } from 'react'
import { parseMarkdown } from '../utils/markdown'

interface MarkdownContentProps {
  content: string
  className?: string
}

export default function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = parseMarkdown(content)
    }
  }, [content])

  return (
    <div
      ref={containerRef}
      className={`markdown-content ${className}`}
    />
  )
}