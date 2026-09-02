import { memo, useCallback, useMemo } from 'react'
import 'katex/dist/katex.min.css'
import { parseMarkdown } from '@/utils/markdown'
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
    return parsed
  }, [content, searchQuery])

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const targetElement = event.target as HTMLElement | null
    const mermaidToggle = targetElement?.closest('[data-mermaid-toggle]') as HTMLButtonElement | null
    if (mermaidToggle) {
      const block = mermaidToggle.closest('.mermaid-block') as HTMLElement | null
      const view = mermaidToggle.dataset.mermaidToggle
      if (!block || (view !== 'rendered' && view !== 'source')) {
        return
      }

      block.dataset.mermaidView = view
      block.querySelectorAll<HTMLButtonElement>('[data-mermaid-toggle]').forEach((button) => {
        const isActive = button.dataset.mermaidToggle === view
        button.classList.toggle('is-active', isActive)
        button.setAttribute('aria-pressed', String(isActive))
      })
      const renderedView = block.querySelector<HTMLElement>('.mermaid-rendered-view')
      const sourceView = block.querySelector<HTMLElement>('.mermaid-source-view')
      if (renderedView) renderedView.hidden = view !== 'rendered'
      if (sourceView) sourceView.hidden = view !== 'source'
      return
    }

    const link = targetElement?.closest('a[href]') as HTMLAnchorElement | null
    if (!link) {
      return
    }

    const rawHref = link.getAttribute('data-markdown-href') || link.getAttribute('href')
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
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default memo(MarkdownContent)
