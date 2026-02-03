import { useMemo } from 'react'
import { parseMarkdown } from '../utils/markdown'
import { highlightSearchInHTML } from '../utils/search'

interface MarkdownContentProps {
  content: string
  className?: string
  searchQuery?: string
}

/**
 * Markdown 内容渲染组件
 * 使用 useMemo 缓存解析结果，避免重复计算
 * 使用 dangerouslySetInnerHTML 替代直接操作 DOM
 */
export default function MarkdownContent({ content, className = '', searchQuery = '' }: MarkdownContentProps) {
  // 使用 useMemo 缓存解析后的 HTML，避免重复计算
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