import { useTranslation } from 'react-i18next'
import { escapeHtml, getLanguageFromPath } from '../utils/markdown'
import { shortenPath, formatDate } from '../utils/format'
import { useSessionView } from '../contexts/SessionViewContext'
import CodeBlock from './CodeBlock'

interface WriteExecutionProps {
  filePath: string
  content: string
  output?: string
  timestamp?: string
  entryId: string
}

const OUTPUT_MAX_HEIGHT = 300

export default function WriteExecution({
  filePath,
  content,
  output,
  timestamp,
  entryId,
}: WriteExecutionProps) {
  const { t } = useTranslation()
  const { isToolExpanded, toggleToolExpanded } = useSessionView()
  const expanded = isToolExpanded(entryId)

  const lang = getLanguageFromPath(filePath)
  const displayPath = shortenPath(filePath)
  const lines = content.split('\n')

  return (
    <div className="tool-execution success" id={`entry-${entryId}`}>
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
      <div
        className="tool-header cursor-pointer select-none"
        onClick={() => toggleToolExpanded(entryId)}
      >
        <span className="tool-expand-indicator">
          {expanded ? '▾' : '▸'}
        </span>
        <span className="tool-name">
          <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Write
        </span>
        <span className="tool-path">{escapeHtml(displayPath)}</span>
        <span className="tool-meta">({lines.length} {t('components.writeExecution.lines')})</span>
      </div>

      {expanded && content && (
        <div className="tool-output-wrapper">
          <div className="tool-output">
            <CodeBlock
              code={content}
              language={lang}
              showLineNumbers={true}
              scrollable
              maxHeight={OUTPUT_MAX_HEIGHT}
            />
          </div>
        </div>
      )}

      {expanded && output && (
        <div className="tool-output">
          <div style={{ color: 'var(--success)' }}>{escapeHtml(output)}</div>
        </div>
      )}
    </div>
  )
}
