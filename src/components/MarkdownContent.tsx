import { useEffect, useState } from 'react'
import { parseMarkdownAsync } from '../utils/markdown'
import { highlightSearchInHTML } from '../utils/search'
import { useCodeTheme } from '../hooks/useCodeTheme'

interface MarkdownContentProps {
  content: string
  className?: string
  searchQuery?: string
}

/**
 * Markdown 内容渲染组件
 * 使用异步解析和 useState 管理 HTML
 * 使用 dangerouslySetInnerHTML 替代直接操作 DOM
 */
export default function MarkdownContent({ content, className = '', searchQuery = '' }: MarkdownContentProps) {
  const [html, setHtml] = useState<string>('')
  const theme = useCodeTheme()

  // 异步解析 Markdown 并高亮搜索结果
  useEffect(() => {
    const parseContent = async () => {
      let parsed = await parseMarkdownAsync(content, theme)
      if (searchQuery) {
        parsed = highlightSearchInHTML(parsed, searchQuery)
      }
      setHtml(parsed)
    }
    parseContent()
  }, [content, searchQuery, theme])

  return (
    <div
      className={`markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}