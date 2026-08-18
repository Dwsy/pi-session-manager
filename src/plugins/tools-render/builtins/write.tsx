import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Eye, X } from 'lucide-react'
import type { Content } from '@/types'
import type { ToolRenderPlugin, ToolRenderProps, ResolvedToolData } from '@/plugins/tools-render/types'
import { defaultResolveData } from '@/plugins/tools-render/utils/resolveData'
import { escapeHtml, getLanguageFromPath, renderCodeHtml } from '@/utils/markdown'
import { shortenPath } from '@/utils/format'
import CodeBlock from '@/components/ui/CodeBlock'
import ToolHeader from '@/components/tool-calls/ToolHeader'
import ToolSectionHeader from '@/components/tool-calls/ToolSectionHeader'
import { getToolExecutionClass, getToolRenderStatus, getToolStatusLabel } from '@/plugins/tools-render/utils/status'

/** Maximum height for tool output in pixels */
const OUTPUT_MAX_HEIGHT = 300

interface HtmlPreviewDialogProps {
  title: string
  content: string
  closeLabel: string
  onClose: () => void
}

function HtmlPreviewDialog({ title, content, closeLabel, onClose }: HtmlPreviewDialogProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[650] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex h-[min(82vh,760px)] w-[min(92vw,1100px)] flex-col overflow-hidden rounded-md border border-border bg-background">
        <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border px-3 py-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">{title}</span>
          <button
            type="button"
            className="tool-toggle-button h-7 w-7 shrink-0 p-0"
            aria-label={closeLabel}
            title={closeLabel}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <iframe
          className="min-h-0 w-full flex-1 border-0"
          title={title}
          srcDoc={content}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>,
    document.body,
  )
}

/**
 * Write tool execution renderer
 * Displays file path and written content
 */
function WriteExecution({
  resolvedData,
  searchQuery,
  context,
}: ToolRenderProps) {
  const { args, output, entryId } = resolvedData
  const { isExpanded, toggleExpanded, isMobile, disableSuccessStyle, t, copyToClipboard } = context
  const status = getToolRenderStatus(resolvedData)
  const [previewOpen, setPreviewOpen] = useState(false)

  const filePath = args.file_path || args.path || ''
  const content = args.content || ''
  const canPreviewHtml = Boolean(content) && /\.html$/i.test(String(filePath).trim())
  const previewLabel = t('components.writeExecution.previewHtml', 'Preview HTML')
  const previewTitle = `${previewLabel}: ${filePath}`

  const lang = getLanguageFromPath(filePath)
  const displayPath = isMobile ? shortenPath(filePath) : filePath

  const desktopPathStyle: CSSProperties | undefined = isMobile
    ? undefined
    : {
        overflow: 'visible',
        textOverflow: 'clip',
        whiteSpace: 'normal',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      }

  const lines = content.split('\n')

  return (
    <div className={`tool-execution ${getToolExecutionClass(resolvedData, disableSuccessStyle)}`.trim()} id={`entry-${entryId}`}>
      <ToolHeader
        expandable={Boolean(content || output)}
        expanded={isExpanded}
        onToggle={toggleExpanded}
        ariaLabel={`Write: ${getToolStatusLabel(status, t)}`}
        actions={canPreviewHtml ? (
          <button
            type="button"
            className="tool-toggle-button h-7 w-7 p-0"
            aria-label={previewLabel}
            title={previewLabel}
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="h-4 w-4" />
          </button>
        ) : undefined}
      >
        <span className="tool-expand-indicator">
          {isExpanded ? '▾' : '▸'}
        </span>
        <span className="tool-header-meta">
          <span className="tool-name">
            <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Write
          </span>
        </span>
        <span className="tool-path" style={desktopPathStyle}>{displayPath}</span>
        <span className="tool-detail">{lines.length} lines</span>
        <span className={`tool-status tool-status-${status}`}>{getToolStatusLabel(status, t)}</span>
      </ToolHeader>

      {previewOpen && (
        <HtmlPreviewDialog
          title={previewTitle}
          content={String(content)}
          closeLabel={t('components.writeExecution.closePreview', 'Close preview')}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {content && (
        <div className={`tool-output-wrapper collapsible ${isExpanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded && (
              <div className="tool-output">
                <ToolSectionHeader
                  label={t('components.toolCall.content', 'Content')}
                  text={content}
                  copyText={copyToClipboard}
                />
                <CodeBlock
                  code={content}
                  language={lang}
                  showLineNumbers={true}
                  scrollable
                  maxHeight={OUTPUT_MAX_HEIGHT}
                  searchQuery={searchQuery}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {output && (
        <div className={`tool-output-wrapper collapsible ${isExpanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded && (
              <div className="tool-output">
                <ToolSectionHeader
                  label={t('components.toolCall.output', 'Output')}
                  text={output}
                  copyText={copyToClipboard}
                />
                <pre className="tool-output-plain">{output}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Generate search segments for write tool
 * Includes written content with syntax highlighting
 */
function getWriteSearchSegments(_toolCall: Content, resolvedData: ResolvedToolData): string[] {
  const segments: string[] = []
  const filePath = String(resolvedData.args.file_path || resolvedData.args.path || '')

  if (resolvedData.args.content) {
    segments.push(renderCodeHtml(String(resolvedData.args.content), getLanguageFromPath(filePath)))
  }

  if (resolvedData.output) {
    segments.push(escapeHtml(resolvedData.output))
  }

  return segments
}

/** Write tool render plugin definition */
export const writeToolPlugin: ToolRenderPlugin = {
  id: 'builtin-write',
  name: 'Write',
  match: 'write',
  priority: 100,
  component: WriteExecution,
  resolveData: defaultResolveData,
  getSearchSegments: getWriteSearchSegments,
  getPreview: (_toolCall, data) => {
    const path = data.args.file_path || data.args.path || ''
    return `Write: ${path}`
  },
}
