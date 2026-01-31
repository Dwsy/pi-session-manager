import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { escapeHtml, getLanguageFromPath } from '../utils/markdown'
import { shortenPath } from '../utils/format'
import CodeBlock from './CodeBlock'
import HoverPreview from './HoverPreview'

interface ReadExecutionProps {
  filePath: string
  offset?: number
  limit?: number
  output?: string
  images?: Array<{ mimeType: string; data: string }>
  timestamp?: string
  expanded?: boolean
}

export default function ReadExecution({
  filePath,
  offset = undefined,
  limit,
  output,
  images = [],
  timestamp,
  expanded = false,
}: ReadExecutionProps) {
  const { t } = useTranslation()
  const [localExpanded, setLocalExpanded] = useState(false)

  useEffect(() => {
    setLocalExpanded(expanded)
  }, [expanded])

  const lang = getLanguageFromPath(filePath)
  const displayPath = shortenPath(filePath)

  let pathWithLines = displayPath
  if (offset !== undefined || limit !== undefined) {
    const startLine = offset ?? 1
    const endLine = limit !== undefined ? startLine + limit - 1 : ''
    pathWithLines = `${displayPath}:${startLine}${endLine ? '-' + endLine : ''}`
  }

  const lines = output ? output.split('\n') : []
  const previewLines = lines.slice(0, 20)
  const remaining = lines.length - 20

  return (
    <div className="tool-execution success">
      {timestamp && <div className="message-timestamp">{timestamp}</div>}
      <div className="tool-header">
        <span className="tool-name">
          <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Read
        </span>
        <span className="tool-path">{escapeHtml(pathWithLines)}</span>
      </div>

      {images.length > 0 && (
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

      {output && (
        <div className="tool-output">
          {remaining > 0 && !localExpanded ? (
            <>
              <CodeBlock code={previewLines.join('\n')} language={lang} showLineNumbers={false} />
              <HoverPreview
                content={
                  <div
                    className="expand-hint"
                    onClick={() => setLocalExpanded(true)}
                    style={{ cursor: 'pointer' }}
                  >
                    ... {t('components.expandableOutput.moreLines', { count: remaining })}
                  </div>
                }
                previewContent={
                  <CodeBlock code={output} language={lang} showLineNumbers={false} />
                }
              />
            </>
          ) : (
            <CodeBlock code={output} language={lang} showLineNumbers={false} />
          )}
          {remaining > 0 && localExpanded && (
            <div
              className="expand-hint"
              onClick={() => setLocalExpanded(false)}
              style={{ cursor: 'pointer' }}
            >
              Show less
            </div>
          )}
        </div>
      )}

      {!output && !images.length && (
        <div className="tool-output" style={{ color: '#6a6f85', fontStyle: 'italic' }}>
          No output
        </div>
      )}
    </div>
  )
}