import { useTranslation } from 'react-i18next'
import { escapeHtml, getLanguageFromPath } from '@/utils/markdown'
import { shortenPath } from '@/utils/format'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSessionView } from '@/contexts/SessionViewContext'
import CodeBlock from '@/components/ui/CodeBlock'

interface ReadExecutionProps {
  filePath: string
  offset?: number
  limit?: number
  output?: string
  images?: Array<{ mimeType: string; data: string }>
  entryId: string
  searchQuery?: string
}

const OUTPUT_MAX_HEIGHT = 300

export default function ReadExecution({
  filePath,
  offset = undefined,
  limit,
  output,
  images = [],
  entryId,
  searchQuery = '',
}: ReadExecutionProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { isToolExpanded, toggleToolExpanded } = useSessionView()
  const expanded = isToolExpanded(entryId)

  const lang = getLanguageFromPath(filePath)
  const displayPath = shortenPath(filePath, isMobile ? 42 : 56)

  let pathWithLines = displayPath
  if (offset !== undefined || limit !== undefined) {
    const startLine = offset ?? 1
    const endLine = limit !== undefined ? startLine + limit - 1 : ''
    pathWithLines = `${displayPath}:${startLine}${endLine ? '-' + endLine : ''}`
  }

  const hasContent = output || images.length > 0

  return (
    <div className="tool-execution success" id={`entry-${entryId}`}>
      <div
        className={`tool-header ${hasContent ? 'cursor-pointer select-none' : ''}`}
        onClick={hasContent ? () => toggleToolExpanded(entryId) : undefined}
      >
        {hasContent && (
          <span className="tool-expand-indicator">
            {expanded ? '▾' : '▸'}
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
        <span className="tool-path" title={pathWithLines}>{escapeHtml(pathWithLines)}</span>
      </div>

      {images.length > 0 && (
        <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
          {expanded && (
            <div className="tool-images">
              {images.map((img, idx) => (
                <img
                  key={idx}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  className="tool-image"
                  alt={t('components.readExecution.imageAlt')}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {output && (
        <div className={`tool-output-wrapper collapsible ${expanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
            {expanded && (
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

      {!hasContent && !expanded && (
        <div className="tool-output tool-output-empty">
          <svg className="tool-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>Empty file</span>
        </div>
      )}
    </div>
  )
}
