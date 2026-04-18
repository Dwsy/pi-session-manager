import type { Content } from '@/types'
import type { ToolRenderPlugin, ToolRenderProps, ResolvedToolData } from '@/plugins/tools-render/types'
import { defaultResolveData } from '@/plugins/tools-render/utils/resolveData'
import { escapeHtml, getLanguageFromPath, renderCodeHtml } from '@/utils/markdown'
import { shortenPath } from '@/utils/format'
import CodeBlock from '@/components/ui/CodeBlock'
import { useTranslation } from 'react-i18next'
import type { CSSProperties } from 'react'

/** Maximum height for tool output in pixels */
const OUTPUT_MAX_HEIGHT = 300

/**
 * Read tool execution renderer
 * Displays file path with line numbers and file content
 */
function ReadExecution({
  resolvedData,
  searchQuery,
  context,
}: ToolRenderProps) {
  const { t } = useTranslation()
  const { args, output, images, entryId } = resolvedData
  const { isExpanded, toggleExpanded, isMobile, disableSuccessStyle } = context

  const filePath = args.file_path || args.path || ''
  const offset = args.offset
  const limit = args.limit

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

  let pathWithLines = displayPath
  if (offset !== undefined || limit !== undefined) {
    const startLine = offset ?? 1
    const endLine = limit !== undefined ? startLine + limit - 1 : ''
    pathWithLines = `${displayPath}:${startLine}${endLine ? '-' + endLine : ''}`
  }

  const hasContent = output || (images && images.length > 0)

  return (
    <div className={`tool-execution ${disableSuccessStyle ? '' : 'success'}`.trim()} id={`entry-${entryId}`}>
      <div
        className={`tool-header ${hasContent ? 'cursor-pointer select-none' : ''}`}
        onClick={hasContent ? toggleExpanded : undefined}
      >
        {hasContent && (
          <span className="tool-expand-indicator">
            {isExpanded ? '▾' : '▸'}
          </span>
        )}
        <div className="tool-header-meta">
          <span className="tool-name">
            <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Read
          </span>
        </div>
        <span className="tool-path" style={desktopPathStyle}>{escapeHtml(pathWithLines)}</span>
      </div>

      {images && images.length > 0 && (
        <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
          {isExpanded && (
            <div className="tool-images">
              {images.map((img, idx) => (
                <img
                  key={idx}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  className="tool-image"
                  alt={t('components.readExecution.imageAlt', 'Image')}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {output && (
        <div className={`tool-output-wrapper collapsible ${isExpanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded && (
              <div className="tool-output">
                <CodeBlock
                  code={output}
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

    {/*  {!hasContent && !isExpanded && (*/}
    {/*    <div className="tool-output tool-output-empty">*/}
    {/*      <svg className="tool-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">*/}
    {/*        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />*/}
    {/*        <polyline points="14 2 14 8 20 8" />*/}
    {/*      </svg>*/}
    {/*      <span>Empty file</span>*/}
    {/*    </div>*/}
    {/*  )}*/}
    </div>
  )
}

/**
 * Generate search segments for read tool
 * Includes file content with syntax highlighting
 */
function getReadSearchSegments(_toolCall: Content, resolvedData: ResolvedToolData): string[] {
  const segments: string[] = []
  const filePath = String(resolvedData.args.file_path || resolvedData.args.path || '')

  if (resolvedData.output) {
    segments.push(renderCodeHtml(resolvedData.output, getLanguageFromPath(filePath)))
  }

  return segments
}

/** Read tool render plugin definition */
export const readToolPlugin: ToolRenderPlugin = {
  id: 'builtin-read',
  name: 'Read',
  match: 'read',
  priority: 100,
  component: ReadExecution,
  resolveData: defaultResolveData,
  getSearchSegments: getReadSearchSegments,
  getPreview: (_toolCall, data) => {
    const path = data.args.file_path || data.args.path || ''
    return `Read: ${path}`
  },
}
