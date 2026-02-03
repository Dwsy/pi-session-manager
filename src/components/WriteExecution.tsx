import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { escapeHtml, getLanguageFromPath } from '../utils/markdown'
import { shortenPath, formatDate } from '../utils/format'
import CodeBlock from './CodeBlock'

interface WriteExecutionProps {
  filePath: string
  content: string
  output?: string
  timestamp?: string
  expanded?: boolean
}

export default function WriteExecution({
  filePath,
  content,
  output,
  timestamp,
  expanded = false,
}: WriteExecutionProps) {
  const { t } = useTranslation()
  const [localExpanded, setLocalExpanded] = useState(false)

  useEffect(() => {
    setLocalExpanded(expanded)
  }, [expanded])

  const lang = getLanguageFromPath(filePath)
  const displayPath = shortenPath(filePath)
  const lines = content.split('\n')
  const remaining = lines.length - 20

  return (
    <div className="tool-execution success">
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
      <div className="tool-header">
        <span className="tool-name">
          <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Write
        </span>
        <span className="tool-path">{escapeHtml(displayPath)}</span>
        <span className="tool-meta">({lines.length} {t('components.writeExecution.lines')})</span>
      </div>

      {content && (
        <div className="tool-output">
          {remaining > 0 && !localExpanded ? (
            <>
              <CodeBlock code={lines.slice(0, 20).join('\n')} language={lang} showLineNumbers={false} />
              <div
                className="expand-hint"
                onClick={() => setLocalExpanded(true)}
                style={{ cursor: 'pointer' }}
              >
                ... {t('components.writeExecution.moreLines', { count: remaining })}
              </div>
            </>
          ) : (
            <CodeBlock code={content} language={lang} showLineNumbers={false} />
          )}
          {remaining > 0 && localExpanded && (
            <div
              className="expand-hint"
              onClick={() => setLocalExpanded(false)}
              style={{ cursor: 'pointer' }}
            >
              {t('components.writeExecution.showLess', 'Show less')}
            </div>
          )}
        </div>
      )}

      {output && (
        <div className="tool-output">
          <div style={{ color: '#b5bd68' }}>{escapeHtml(output)}</div>
        </div>
      )}
    </div>
  )
}