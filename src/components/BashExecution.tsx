import { useMemo, useState } from 'react'
import { useSessionView } from '../contexts/SessionViewContext'
import CodeBlock from './CodeBlock'
import hljs from 'highlight.js'
import { escapeHtml } from '../utils/markdown'

interface BashExecutionProps {
  command: string
  output?: string
  exitCode?: number | null
  cancelled?: boolean
  entryId: string
}

const OUTPUT_MAX_HEIGHT = 300

export default function BashExecution({
  command,
  output,
  exitCode,
  cancelled,
  entryId,
}: BashExecutionProps) {
  const { isToolExpanded, toggleToolExpanded } = useSessionView()
  const expanded = isToolExpanded(entryId)
  const [commandCopied, setCommandCopied] = useState(false)

  const highlightedCommand = useMemo(() => {
    try {
      return hljs.highlight(command, { language: 'bash' }).value
    } catch {
      try {
        return hljs.highlightAuto(command, ['bash', 'shell', 'sh']).value
      } catch {
        return escapeHtml(command)
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
      <div
        className="tool-header tool-header-bash cursor-pointer select-none"
        onClick={() => toggleToolExpanded(entryId)}
      >
        <span className="tool-expand-indicator">
          {expanded ? '▾' : '▸'}
        </span>
        <pre className="bash-command-inline" title={command}>
          <span className="bash-command-prefix" aria-hidden="true">$ </span>
          <code className="hljs language-bash" dangerouslySetInnerHTML={{ __html: highlightedCommand }} />
        </pre>
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
        <button
          onClick={(event) => {
            event.stopPropagation()
            void handleCopyCommand()
          }}
          className="tool-copy-button bash-inline-copy-button"
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
