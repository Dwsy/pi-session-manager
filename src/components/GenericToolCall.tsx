import { escapeHtml } from '../utils/markdown'
import { useSessionView } from '../contexts/SessionViewContext'

interface GenericToolCallProps {
  name: string
  arguments?: Record<string, any>
  output?: string
  isError?: boolean
  entryId: string
}

const OUTPUT_MAX_HEIGHT = 300

export default function GenericToolCall({
  name,
  arguments: args,
  output,
  isError = false,
  entryId,
}: GenericToolCallProps) {
  const { isToolExpanded, toggleToolExpanded } = useSessionView()
  const expanded = isToolExpanded(entryId)

  const statusClass = isError ? 'error' : 'success'

  const formatArgs = (obj: Record<string, any>): string => {
    return JSON.stringify(obj, null, 2)
  }

  const argsText = args ? formatArgs(args) : ''
  const hasArgs = args && Object.keys(args).length > 0
  const hasOutput = output && output.length > 0

  return (
    <div className={`tool-execution ${statusClass}`} id={`entry-${entryId}`}>
      <div
        className={`tool-header ${(hasArgs || hasOutput) ? 'cursor-pointer select-none' : ''}`}
        onClick={(hasArgs || hasOutput) ? () => toggleToolExpanded(entryId) : undefined}
      >
        {(hasArgs || hasOutput) && (
          <span className="tool-expand-indicator">
            {expanded ? '▾' : '▸'}
          </span>
        )}
        <span className="tool-name">
          <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {escapeHtml(name)}
        </span>
      </div>

      {hasArgs && (
        <div className="tool-output-wrapper">
          <div className="tool-output-header">
            <span className="tool-output-label">Arguments</span>
          </div>
          <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
            <div
              className="tool-arguments"
              style={{ maxHeight: OUTPUT_MAX_HEIGHT, overflowY: 'auto', margin: 0 }}
            >
              <pre><code>{escapeHtml(argsText)}</code></pre>
            </div>
          </div>
        </div>
      )}

      {hasOutput && (
        <div className="tool-output-wrapper">
          <div className="tool-output-header">
            <span className="tool-output-label">Output</span>
          </div>
          <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
            <div
              className="tool-output"
              style={{ maxHeight: OUTPUT_MAX_HEIGHT, overflowY: 'auto' }}
            >
              {output.split('\n').map((line, idx) => (
                <div key={idx}>{escapeHtml(line)}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
