import { memo, useCallback, useMemo } from 'react'
import { parseMarkdown, sanitizeMarkdownHtml } from '@/utils/markdown'
import {
  classifyMarkdownLink,
  getMarkdownLinkConfirmationMessage,
  openMarkdownLinkTarget,
} from '@/utils/markdownLinks'
import { highlightSearchInHTML } from '@/utils/search'

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
    return sanitizeMarkdownHtml(parsed)
  }, [content, searchQuery])

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null
    if (!link) {
      return
    }

    const rawHref = link.getAttribute('data-markdown-href') || link.getAttribute('href')
    if (!rawHref || rawHref === '#') {
      return
    }
    const target = classifyMarkdownLink(rawHref)
    if (target.kind === 'anchor') {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (target.kind === 'unsupported') {
      window.alert(getMarkdownLinkConfirmationMessage(target))
      return
    }

    if (target.kind === 'external-url' && !window.confirm(getMarkdownLinkConfirmationMessage(target))) {
      return
    }

    void openMarkdownLinkTarget(target).catch((error) => {
      console.error('Failed to open markdown link:', error)
      window.alert(`Failed to open link: ${error instanceof Error ? error.message : String(error)}`)
    })
  }, [])

  return (
    <div
      className={`markdown-content ${className}`}
      onClickCapture={handleClick}
      dangerouslySetInnerHTML={{ __html: sanitizeMarkdownHtml(html) }}
    />
  )
}

export default memo(MarkdownContent)
