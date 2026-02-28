import { useEffect, useRef, useState } from 'react'
import { formatDate } from '../utils/format'
import { useSessionView } from '../contexts/SessionViewContext'
import CodeBlock from './CodeBlock'
import hljs from 'highlight.js'

interface BashExecutionProps {
  command: string
  output?: string
  exitCode?: number | null
  cancelled?: boolean
  timestamp?: string
  entryId: string
}

const OUTPUT_MAX_HEIGHT = 300

export default function BashExecution({
  command,
  output,
  exitCode,
  cancelled,
  timestamp,
  entryId,
}: BashExecutionProps) {
  const { isToolExpanded, toggleToolExpanded } = useSessionView()
  const expanded = isToolExpanded(entryId)
  const codeRef = useRef<HTMLElement>(null)
  const [commandCopied, setCommandCopied] = useState(false)

  useEffect(() => {
    if (codeRef.current && codeRef.current.dataset.highlighted !== 'yes') {
      try {
        hljs.highlightElement(codeRef.current)
      } catch (e) {
        console.warn('Failed to highlight bash code:', e)
      }
    }
  }, [command])

  const isError = cancelled || (exitCode !== undefined && exitCode !== null && exitCode !== 0)
  const statusClass = isError ? 'error' : 'success'

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCommandCopied(true)
      setTimeout(() => setCommandCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy command:', err)
    }
  }

  return (
    <div className={`tool-execution ${statusClass}`} id={`entry-${entryId}`}>
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Bash
        </span>
        {exitCode !== undefined && exitCode !== null && (
          <span className="tool-meta" style={{ color: exitCode === 0 ? 'var(--success)' : 'var(--error)' }}>
            exit {exitCode}
          </span>
        )}
        {cancelled && (
          <span className="tool-meta" style={{ color: 'var(--warning)' }}>
            cancelled
          </span>
        )}
      </div>

      <div className="tool-command-wrapper">
        <pre className="tool-command-highlighted">
          <code ref={codeRef} className="language-shell">{command}</code>
        </pre>
        <button
          onClick={handleCopyCommand}
          className="tool-copy-button"
          title={commandCopied ? 'Copied!' : 'Copy command'}
        >
          {commandCopied ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>

      {output && (
        <div className="tool-output-wrapper">
          <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
            <CodeBlock
              code={output}
              language="shell"
              showLineNumbers={true}
              scrollable
              maxHeight={OUTPUT_MAX_HEIGHT}
            />
          </div>
        </div>
      )}
    </div>
  )
}
