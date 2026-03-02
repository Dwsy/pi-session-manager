import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { escapeHtml, getLanguageFromPath } from '../utils/markdown'
import { shortenPath } from '../utils/format'
import { useIsMobile } from '../hooks/useIsMobile'
import { useSessionView } from '../contexts/SessionViewContext'
import CodeBlock from './CodeBlock'

interface ReadExecutionProps {
  filePath: string
  offset?: number
  limit?: number
  output?: string
  images?: Array<{ mimeType: string; data: string }>
  entryId: string
}

const OUTPUT_MAX_HEIGHT = 300

export default function ReadExecution({
  filePath,
  offset = undefined,
  limit,
  output,
  images = [],
  entryId,
}: ReadExecutionProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { isToolExpanded, toggleToolExpanded } = useSessionView()
  const expanded = isToolExpanded(entryId)

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
        <span className="tool-path" style={desktopPathStyle}>{escapeHtml(pathWithLines)}</span>
      </div>

      {images.length > 0 && (
        <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
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
        </div>
      )}

      {output && (
        <div className="tool-output-wrapper">
          <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
            <div className="tool-output">
              <CodeBlock
                code={output}
                language={lang}
                showLineNumbers={true}
                scrollable
                maxHeight={OUTPUT_MAX_HEIGHT}
              />
            </div>
          </div>
        </div>
      )}

      {!hasContent && !expanded && (
        <div className="tool-output" style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
          No output
        </div>
      )}
    </div>
  )
}
