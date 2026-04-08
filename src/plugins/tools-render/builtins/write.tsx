import type { CSSProperties } from 'react'
import type { Content } from '@/types'
import type { ToolRenderPlugin, ToolRenderProps, ResolvedToolData } from '@/plugins/tools-render/types'
import { defaultResolveData } from '@/plugins/tools-render/utils/resolveData'
import { escapeHtml, getLanguageFromPath, renderCodeHtml } from '@/utils/markdown'
import { shortenPath } from '@/utils/format'
import CodeBlock from '@/components/ui/CodeBlock'

/** Maximum height for tool output in pixels */
const OUTPUT_MAX_HEIGHT = 300

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
  const { isExpanded, toggleExpanded, isMobile, disableSuccessStyle } = context

  const filePath = args.file_path || args.path || ''
  const content = args.content || ''

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
    <div className={`tool-execution ${disableSuccessStyle ? '' : 'success'}`.trim()} id={`entry-${entryId}`}>
      <div
        className="tool-header cursor-pointer select-none"
        onClick={toggleExpanded}
      >
        <span className="tool-expand-indicator">
          {isExpanded ? '▾' : '▸'}
        </span>
        <div className="tool-header-meta">
          <span className="tool-name">
            <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Write
          </span>
        </div>
        <span className="tool-path" style={desktopPathStyle}>{escapeHtml(displayPath)}</span>
        <span className="tool-meta">({lines.length} lines)</span>
      </div>

      {content && (
        <div className={`tool-output-wrapper collapsible ${isExpanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded && (
              <div className="tool-output">
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
                <div dangerouslySetInnerHTML={{ __html: escapeHtml(output) }} />
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
