import { useState, useMemo } from 'react'
import type { Content } from '@/types'
import type { ToolRenderPlugin, ToolRenderProps, ResolvedToolData } from '@/plugins/tools-render/types'
import { defaultResolveData } from '@/plugins/tools-render/utils/resolveData'
import { renderCodeHtml } from '@/utils/markdown'
import { highlightSearchInHTML } from '@/utils/search'
import CodeBlock from '@/components/ui/CodeBlock'
import ToolHeader from '@/components/tool-calls/ToolHeader'
import ToolSectionHeader from '@/components/tool-calls/ToolSectionHeader'
import { getToolExecutionClass, getToolRenderStatus, getToolStatusLabel } from '@/plugins/tools-render/utils/status'

/** Maximum height for tool output in pixels */
const OUTPUT_MAX_HEIGHT = 450

/**
 * Bash tool execution renderer
 * Displays command with exit code and expandable output
 */
function BashExecution({
  resolvedData,
  searchQuery,
  context,
}: ToolRenderProps) {
  const { args, output, result, entryId } = resolvedData
  const { isExpanded, toggleExpanded, copyToClipboard, disableSuccessStyle, t } = context
  const status = getToolRenderStatus(resolvedData)

  const [commandCopied, setCommandCopied] = useState(false)

  const command = args.command || ''
  const exitCode = result?.message?.exitCode
  const cancelled = result?.message?.cancelled

  const highlightedCommand = useMemo(() => {
    const highlighted = renderCodeHtml(command, 'bash')
    return searchQuery
      ? highlightSearchInHTML(highlighted, searchQuery)
      : highlighted
  }, [command, searchQuery])

  const handleCopyCommand = async () => {
    try {
      await copyToClipboard(command)
      setCommandCopied(true)
      setTimeout(() => setCommandCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy command:', err)
    }
  }

  return (
    <div className={`tool-execution ${getToolExecutionClass(resolvedData, disableSuccessStyle)}`} id={`entry-${entryId}`}>
      <ToolHeader
        className="tool-header-bash"
        expandable={Boolean(command || output)}
        expanded={isExpanded}
        onToggle={toggleExpanded}
        ariaLabel={`Bash: ${getToolStatusLabel(status, t)}`}
        actions={
          <button
            type="button"
            onClick={() => void handleCopyCommand()}
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
        }
      >
        <span className="tool-expand-indicator">
          {isExpanded ? '▾' : '▸'}
        </span>
        <span className="bash-command-inline" title={command}>
          <span className="bash-command-prefix" aria-hidden="true">$ </span>
          <code
            className="shiki language-bash"
            dangerouslySetInnerHTML={{ __html: highlightedCommand }}
          />
        </span>

        {exitCode !== undefined && exitCode !== null && (
          <span
            className="tool-detail"
            style={{ color: exitCode === 0 ? 'var(--success)' : 'var(--error)' }}
          >
            exit {exitCode}
          </span>
        )}

        {cancelled && (
          <span className="tool-detail" style={{ color: 'var(--warning)' }}>
            cancelled
          </span>
        )}

        <span className={`tool-status tool-status-${status}`}>{getToolStatusLabel(status, t)}</span>
      </ToolHeader>

      {command && isExpanded && (
        <div className="tool-command-detail">
          <ToolSectionHeader
            label={t('components.toolCall.command', 'Command')}
            text={command}
            copyText={copyToClipboard}
          />
          <pre className="tool-command-expanded">
            <code
              className="shiki language-bash"
              dangerouslySetInnerHTML={{ __html: highlightedCommand }}
            />
          </pre>
        </div>
      )}

      {output && (
        <div className={`tool-output-wrapper collapsible ${isExpanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded && (
              <>
                <ToolSectionHeader
                  label={t('components.toolCall.output', 'Output')}
                  text={output}
                  copyText={copyToClipboard}
                />
                <CodeBlock
                  code={output}
                  language="shell"
                  showLineNumbers={true}
                  scrollable
                  maxHeight={OUTPUT_MAX_HEIGHT}
                  searchQuery={searchQuery}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Generate search segments for bash tool
 * Includes highlighted command and output
 */
function getBashSearchSegments(_toolCall: Content, resolvedData: ResolvedToolData): string[] {
  const segments: string[] = []

  if (resolvedData.args.command) {
    segments.push(renderCodeHtml(String(resolvedData.args.command), 'bash'))
  }

  if (resolvedData.output) {
    segments.push(renderCodeHtml(resolvedData.output, 'shell'))
  }

  return segments
}

/** Bash tool render plugin definition */
export const bashToolPlugin: ToolRenderPlugin = {
  id: 'builtin-bash',
  name: 'Bash',
  match: 'bash',
  priority: 100,
  component: BashExecution,
  resolveData: defaultResolveData,
  getSearchSegments: getBashSearchSegments,
  getPreview: (_toolCall, data) => {
    const cmd = data.args.command || ''
    return `$ ${cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd}`
  },
}
