import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import 'katex/dist/katex.min.css'
import MermaidViewer from './MermaidViewer'
import { parseMarkdown } from '@/utils/markdown'
import { renderMermaidSvg, type MermaidDiagram } from '@/utils/mermaidOndine'
import { clampMermaidZoom, formatMermaidZoom, MERMAID_ZOOM_MAX, MERMAID_ZOOM_STEP, minMermaidZoom } from '@/utils/mermaidZoom'
import { enableMarkdownTableResize } from '@/utils/markdownTableResize'
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

interface MermaidViewerState {
  diagram: MermaidDiagram
  source: string
  index: number
}

function getMermaidSize(block: HTMLElement) {
  const view = block.querySelector<HTMLElement>('.mermaid-rendered-view')
  const svg = block.querySelector<SVGSVGElement>('.mermaid-svg > svg')
  const naturalWidth = Number(block.dataset.mermaidWidth)
  if (!view || !svg || !Number.isFinite(naturalWidth) || naturalWidth <= 0) return null
  const style = getComputedStyle(view)
  const availableWidth = view.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
  const fitScale = availableWidth > 0 ? Math.min(1, availableWidth / naturalWidth) : 1
  const savedScale = Number(block.dataset.mermaidScale)
  const scale = block.dataset.mermaidScale && Number.isFinite(savedScale)
    ? clampMermaidZoom(savedScale, fitScale)
    : fitScale
  return { svg, naturalWidth, availableWidth, fitScale, scale }
}

function updateMermaidSize(block: HTMLElement) {
  const size = getMermaidSize(block)
  if (!size) return
  const { svg, naturalWidth, availableWidth, fitScale, scale } = size
  if (availableWidth > 0) {
    svg.style.width = naturalWidth * scale + 'px'
    svg.style.maxWidth = 'none'
  }
  const label = block.querySelector<HTMLButtonElement>('[data-mermaid-action="fit"]')
  if (label) {
    const value = formatMermaidZoom(scale)
    label.textContent = value
    label.setAttribute('aria-label', (label.dataset.fitLabel || 'Fit diagram to width') + ' (' + value + ')')
  }
  const zoomOut = block.querySelector<HTMLButtonElement>('[data-mermaid-action="zoom-out"]')
  const zoomIn = block.querySelector<HTMLButtonElement>('[data-mermaid-action="zoom-in"]')
  if (zoomOut) zoomOut.disabled = scale <= minMermaidZoom(fitScale)
  if (zoomIn) zoomIn.disabled = scale >= MERMAID_ZOOM_MAX
}

/** Renders Markdown and adds interactions to its generated content. */
function MarkdownContent({ content, className = '', searchQuery = '' }: MarkdownContentProps) {
  const { t } = useTranslation()
  const [viewer, setViewer] = useState<MermaidViewerState | null>(null)
  const viewerRef = useRef<MermaidViewerState | null>(null)
  const viewerTriggerRef = useRef<HTMLButtonElement | null>(null)
  const closeViewer = useCallback(() => {
    viewerRef.current = null
    setViewer(null)
  }, [])
  // Cache parsed HTML with useMemo to avoid recalculation
  const html = useMemo(() => {
    let parsed = parseMarkdown(content)
    if (searchQuery) {
      parsed = highlightSearchInHTML(parsed, searchQuery)
    }
    return parsed
  }, [content, searchQuery])

  const containerRef = useRef<HTMLDivElement>(null)

  // Enhance rendered tables with drag handles after each HTML update.
  useEffect(() => {
    if (containerRef.current) {
      enableMarkdownTableResize(containerRef.current)
    }
  }, [html])

  useEffect(() => {
    const current = viewerRef.current
    if (!current || !containerRef.current) return
    const blocks = Array.from(containerRef.current.querySelectorAll<HTMLElement>('.mermaid-block'))
    const hasSource = (block: HTMLElement | undefined) => block?.querySelector('.mermaid-source code')?.textContent === current.source
    const block = hasSource(blocks[current.index]) ? blocks[current.index] : blocks.find(hasSource)
    if (!block) {
      closeViewer()
      return
    }
    viewerTriggerRef.current = block.querySelector<HTMLButtonElement>('[data-mermaid-action="fullscreen"]')
  }, [html, closeViewer])

  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    const labels: Record<string, string> = {
      'zoom-out': t('components.mermaid.zoomOut', { defaultValue: 'Zoom out' }),
      'zoom-in': t('components.mermaid.zoomIn', { defaultValue: 'Zoom in' }),
      fit: t('components.mermaid.fitWidth', { defaultValue: 'Fit diagram to width' }),
      actual: t('components.mermaid.actualSize', { defaultValue: 'Actual size (100%)' }),
      fullscreen: t('components.mermaid.fullscreen', { defaultValue: 'Open diagram full screen' }),
    }
    root.querySelectorAll<HTMLButtonElement>('[data-mermaid-action]').forEach((button) => {
      const label = labels[button.dataset.mermaidAction || '']
      if (label) {
        button.setAttribute('aria-label', label)
        button.title = label
        if (button.dataset.mermaidAction === 'fit') button.dataset.fitLabel = label
      }
    })
    const blocks = Array.from(root.querySelectorAll<HTMLElement>('.mermaid-block'))
    if (!blocks.length) return
    const diagramLabel = t('components.mermaid.inlineDiagram', { defaultValue: 'Mermaid diagram' })
    const viewLabel = t('components.mermaid.viewLabel', { defaultValue: 'Mermaid view' })
    const renderedLabel = t('components.mermaid.rendered', { defaultValue: 'Rendered' })
    blocks.forEach((block) => {
      block.querySelector('.mermaid-rendered-view')?.setAttribute('aria-label', diagramLabel)
      block.querySelector('.mermaid-toolbar')?.setAttribute('aria-label', viewLabel)
      const rendered = block.querySelector<HTMLElement>('[data-mermaid-toggle="rendered"]')
      if (rendered) rendered.textContent = renderedLabel
    })
    const resize = () => blocks.forEach(updateMermaidSize)
    resize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    blocks.forEach((block) => {
      const view = block.querySelector<HTMLElement>('.mermaid-rendered-view')
      if (view) observer?.observe(view)
    })
    window.addEventListener('resize', resize)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [html, t])

  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const targetElement = event.target as HTMLElement | null
    const actionButton = targetElement?.closest('[data-mermaid-action]') as HTMLButtonElement | null
    if (actionButton) {
      const block = actionButton.closest<HTMLElement>('.mermaid-block')
      const action = actionButton.dataset.mermaidAction
      if (!block) return
      event.preventDefault()
      event.stopPropagation()
      if (action === 'fullscreen') {
        const source = block.querySelector('.mermaid-source code')?.textContent
        const diagram = source && renderMermaidSvg(source)
        if (diagram && source) {
          const blocks = Array.from(containerRef.current?.querySelectorAll('.mermaid-block') || [])
          viewerTriggerRef.current = actionButton
          const nextViewer = { diagram, source, index: blocks.indexOf(block) }
          viewerRef.current = nextViewer
          setViewer(nextViewer)
        }
      } else if (action === 'fit') {
        delete block.dataset.mermaidScale
        updateMermaidSize(block)
      } else if (action === 'actual') {
        block.dataset.mermaidScale = '1'
        updateMermaidSize(block)
      } else if (action === 'zoom-in' || action === 'zoom-out') {
        const size = getMermaidSize(block)
        if (!size) return
        const factor = action === 'zoom-in' ? MERMAID_ZOOM_STEP : 1 / MERMAID_ZOOM_STEP
        block.dataset.mermaidScale = String(clampMermaidZoom(size.scale * factor, size.fitScale))
        updateMermaidSize(block)
      }
      return
    }
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
      if (view === 'rendered') updateMermaidSize(block)
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
    <>
      <div
        ref={containerRef}
        className={`markdown-content ${className}`}
        onClickCapture={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {viewer && <MermaidViewer diagram={viewer.diagram} returnFocus={viewerTriggerRef} onClose={closeViewer} />}
    </>
  )
}

export default memo(MarkdownContent)
