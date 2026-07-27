import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { escapeHtml, getLanguageFromPath } from '@/utils/markdown'
import { shortenPath } from '@/utils/format'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSessionView } from '@/contexts/SessionViewContext'
import { highlightSearchInHTML } from '@/utils/search'
import CodeBlock from '@/components/ui/CodeBlock'
import ToolHeader from '@/components/tool-calls/ToolHeader'
import ToolSectionHeader from '@/components/tool-calls/ToolSectionHeader'
import { useClipboard } from '@/hooks/useClipboard'
import { useSettings } from '@/hooks/useSettings'
import { getToolStatusLabel, type ToolRenderStatus } from '@/plugins/tools-render/utils/status'

interface WriteExecutionProps {
  filePath: string
  content: string
  output?: string
  hasResult?: boolean
  entryId: string
  searchQuery?: string
}

const OUTPUT_MAX_HEIGHT = 300

export default function WriteExecution({
  filePath,
  content,
  output,
  hasResult = true,
  entryId,
  searchQuery = '',
}: WriteExecutionProps) {
  const { t } = useTranslation()
  const { settings } = useSettings()
  const { copyText } = useClipboard()
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
  const lines = content.split('\n')
  const highlightedOutput = useMemo(() => {
    if (!output) return ''
    const escapedOutput = escapeHtml(output)
    return searchQuery
      ? highlightSearchInHTML(escapedOutput, searchQuery)
      : escapedOutput
  }, [output, searchQuery])
  const status: ToolRenderStatus = hasResult ? 'success' : 'pending'
  const statusClass = status === 'success' && settings.appearance.disableToolSuccessStyle
    ? ''
    : status
  const statusLabel = getToolStatusLabel(status, t)

  return (
    <div className={`tool-execution ${statusClass}`.trim()} id={`entry-${entryId}`}>
      <ToolHeader
        expandable={Boolean(content || output)}
        expanded={expanded}
        onToggle={() => toggleToolExpanded(entryId)}
        ariaLabel={`Write: ${statusLabel}`}
      >
        <span className="tool-expand-indicator" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
        <span className="tool-header-meta"><span className="tool-name">Write</span></span>
        <span className="tool-path" style={desktopPathStyle}>{displayPath}</span>
        <span className="tool-detail">{lines.length} {t('components.writeExecution.lines')}</span>
        <span className={`tool-status tool-status-${status}`}>{statusLabel}</span>
      </ToolHeader>

      {content ? (
        <div className={`tool-output-wrapper collapsible ${expanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
            {expanded ? (
              <div className="tool-output">
                <ToolSectionHeader
                  label={t('components.toolCall.content', 'Content')}
                  text={content}
                  copyText={copyText}
                />
                <CodeBlock
                  code={content}
                  language={lang}
                  showLineNumbers
                  scrollable
                  maxHeight={OUTPUT_MAX_HEIGHT}
                  searchQuery={searchQuery}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {output ? (
        <div className={`tool-output-wrapper collapsible ${expanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
            {expanded ? (
              <div className="tool-output">
                <ToolSectionHeader
                  label={t('components.toolCall.output', 'Output')}
                  text={output}
                  copyText={copyText}
                />
                <pre
                  className="tool-output-plain"
                  dangerouslySetInnerHTML={{ __html: highlightedOutput }}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
