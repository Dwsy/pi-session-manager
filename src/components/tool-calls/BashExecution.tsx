import { useMemo, useState } from 'react'
import { useSessionView } from '@/contexts/SessionViewContext'
import CodeBlock from '@/components/ui/CodeBlock'
import { renderCodeHtml } from '@/utils/markdown'
import { highlightSearchInHTML } from '@/utils/search'
import { useClipboard } from '@/hooks/useClipboard'

interface BashExecutionProps {
  command: string
  output?: string
  exitCode?: number | null
  cancelled?: boolean
  entryId: string
  searchQuery?: string
}

const OUTPUT_MAX_HEIGHT = 300

export default function BashExecution({
  command,
  output,
  exitCode,
  cancelled,
  entryId,
  searchQuery = '',
}: BashExecutionProps) {
  const { isToolExpanded, toggleToolExpanded } = useSessionView()
  const expanded = isToolExpanded(entryId)
  const [commandCopied, setCommandCopied] = useState(false)
  const { copyText } = useClipboard()

  const highlightedCommand = useMemo(() => {
    const highlighted = renderCodeHtml(command, 'bash')
    return searchQuery
      ? highlightSearchInHTML(highlighted, searchQuery)
      : highlighted
  }, [command, searchQuery])

  const isError = cancelled || (exitCode !== undefined && exitCode !== null && exitCode !== 0)
  const statusClass = isError ? 'error' : 'success'

  const handleCopyCommand = async () => {
    try {
      await copyText(command)
      setCommandCopied(true)
      setTimeout(() => setCommandCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy command:', err)
    }
  }

  return (
    <div className={`tool-execution ${statusClass}`} id={`entry-${entryId}`}>
      <div
        className="tool-header tool-header-bash select-none"
        onClick={() => toggleToolExpanded(entryId)}
      >
        <span className="tool-expand-indicator">
          {expanded ? '▾' : '▸'}
        </span>
        <pre className="bash-command-inline">
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
          aria-label={commandCopied ? 'Copied!' : 'Copy command'}
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
        <div className={`tool-output-wrapper collapsible ${expanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
            {expanded && (
              <CodeBlock
                code={output}
                language="shell"
                showLineNumbers={true}
                scrollable
                maxHeight={OUTPUT_MAX_HEIGHT}
                searchQuery={searchQuery}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
