import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy } from 'lucide-react'
import { useSessionView } from '@/contexts/SessionViewContext'
import CodeBlock from '@/components/ui/CodeBlock'
import ToolHeader from '@/components/tool-calls/ToolHeader'
import ToolSectionHeader from '@/components/tool-calls/ToolSectionHeader'
import { renderCodeHtml } from '@/utils/markdown'
import { highlightSearchInHTML } from '@/utils/search'
import { useClipboard } from '@/hooks/useClipboard'
import { useSettings } from '@/hooks/useSettings'
import { getToolStatusLabel, type ToolRenderStatus } from '@/plugins/tools-render/utils/status'

interface BashExecutionProps {
  command: string
  output?: string
  exitCode?: number | null
  cancelled?: boolean
  hasResult?: boolean
  entryId: string
  searchQuery?: string
}

const OUTPUT_MAX_HEIGHT = 300

export default function BashExecution({
  command,
  output,
  exitCode,
  cancelled,
  hasResult,
  entryId,
  searchQuery = '',
}: BashExecutionProps) {
  const { t } = useTranslation()
  const { settings } = useSettings()
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

  const resultKnown = hasResult ?? (
    output !== undefined || exitCode !== undefined || cancelled !== undefined
  )
  const isError = Boolean(
    cancelled || (typeof exitCode === 'number' && exitCode !== 0),
  )
  const status: ToolRenderStatus = isError
    ? 'error'
    : resultKnown
      ? 'success'
      : 'pending'
  const statusClass = status === 'success' && settings.appearance.disableToolSuccessStyle
    ? ''
    : status
  const statusLabel = getToolStatusLabel(status, t)

  const handleCopyCommand = async () => {
    await copyText(command)
    setCommandCopied(true)
    window.setTimeout(() => setCommandCopied(false), 1600)
  }

  return (
    <div className={`tool-execution ${statusClass}`.trim()} id={`entry-${entryId}`}>
      <ToolHeader
        className="tool-header-bash"
        expandable={Boolean(command || output)}
        expanded={expanded}
        onToggle={() => toggleToolExpanded(entryId)}
        ariaLabel={t('components.toolCall.bashStatus', 'Bash: {{status}}', { status: statusLabel })}
        actions={
          <button
            type="button"
            onClick={() => void handleCopyCommand()}
            className="tool-copy-button bash-inline-copy-button"
            aria-label={
              commandCopied
                ? t('components.toolCall.commandCopied', 'Copied command')
                : t('components.toolCall.copyCommand', 'Copy command')
            }
          >
            {commandCopied ? (
              <Check className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Copy className="h-3 w-3" aria-hidden="true" />
            )}
          </button>
        }
      >
        <span className="tool-expand-indicator" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
        <span className="bash-command-inline" title={command}>
          <span className="bash-command-prefix" aria-hidden="true">$ </span>
          <code
            className="shiki language-bash"
            dangerouslySetInnerHTML={{ __html: highlightedCommand }}
          />
        </span>
        {exitCode !== undefined && exitCode !== null ? (
          <span className="tool-detail">exit {exitCode}</span>
        ) : null}
        {cancelled ? <span className="tool-detail">cancelled</span> : null}
        <span className={`tool-status tool-status-${status}`}>{statusLabel}</span>
      </ToolHeader>

      {command && expanded ? (
        <div className="tool-command-detail">
          <ToolSectionHeader
            label={t('components.toolCall.command', 'Command')}
            text={command}
            copyText={copyText}
          />
          <pre className="tool-command-expanded">
            <code
              className="shiki language-bash"
              dangerouslySetInnerHTML={{ __html: highlightedCommand }}
            />
          </pre>
        </div>
      ) : null}

      {output ? (
        <div className={`tool-output-wrapper collapsible ${expanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
            {expanded ? (
              <>
                <ToolSectionHeader
                  label={t('components.toolCall.output', 'Output')}
                  text={output}
                  copyText={copyText}
                />
                <CodeBlock
                  code={output}
                  language="shell"
                  showLineNumbers
                  scrollable
                  maxHeight={OUTPUT_MAX_HEIGHT}
                  searchQuery={searchQuery}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
