import { useTranslation } from 'react-i18next'
import { getLanguageFromPath } from '@/utils/markdown'
import { shortenPath } from '@/utils/format'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSessionView } from '@/contexts/SessionViewContext'
import CodeBlock from '@/components/ui/CodeBlock'
import ToolHeader from '@/components/tool-calls/ToolHeader'
import ToolSectionHeader from '@/components/tool-calls/ToolSectionHeader'
import { useClipboard } from '@/hooks/useClipboard'
import { useSettings } from '@/hooks/useSettings'
import { getToolStatusLabel, type ToolRenderStatus } from '@/plugins/tools-render/utils/status'

interface ReadExecutionProps {
  filePath: string
  offset?: number
  limit?: number
  output?: string
  images?: Array<{ mimeType: string; data: string }>
  hasResult?: boolean
  entryId: string
  searchQuery?: string
}

const OUTPUT_MAX_HEIGHT = 300

export default function ReadExecution({
  filePath,
  offset,
  limit,
  output,
  images = [],
  hasResult = true,
  entryId,
  searchQuery = '',
}: ReadExecutionProps) {
  const { t } = useTranslation()
  const { settings } = useSettings()
  const { copyText } = useClipboard()
  const isMobile = useIsMobile()
  const { isToolExpanded, toggleToolExpanded } = useSessionView()
  const expanded = isToolExpanded(entryId)

  const lang = getLanguageFromPath(filePath)
  const displayPath = shortenPath(filePath, isMobile ? 42 : 56)
  const startLine = offset ?? 1
  const endLine = limit !== undefined ? startLine + limit - 1 : null
  const pathWithLines = offset !== undefined || limit !== undefined
    ? `${displayPath}:${startLine}${endLine ? `-${endLine}` : ''}`
    : displayPath
  const hasContent = Boolean(output) || images.length > 0
  const status: ToolRenderStatus = hasResult ? 'success' : 'pending'
  const statusClass = status === 'success' && settings.appearance.disableToolSuccessStyle
    ? ''
    : status
  const statusLabel = getToolStatusLabel(status, t)

  return (
    <div className={`tool-execution ${statusClass}`.trim()} id={`entry-${entryId}`}>
      <ToolHeader
        expandable={hasContent}
        expanded={expanded}
        onToggle={() => toggleToolExpanded(entryId)}
        ariaLabel={`Read: ${statusLabel}`}
      >
        {hasContent ? (
          <span className="tool-expand-indicator" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        ) : null}
        <span className="tool-header-meta">
          <span className="tool-name">Read</span>
        </span>
        <span className="tool-path" title={pathWithLines}>{pathWithLines}</span>
        <span className={`tool-status tool-status-${status}`}>{statusLabel}</span>
      </ToolHeader>

      {images.length > 0 ? (
        <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
          {expanded ? (
            <div className="tool-images">
              {images.map((image, index) => (
                <img
                  key={`${image.mimeType}-${index}`}
                  src={`data:${image.mimeType};base64,${image.data}`}
                  className="tool-image"
                  alt={`${t('components.readExecution.imageAlt')} ${index + 1}`}
                  loading="lazy"
                />
              ))}
            </div>
          ) : null}
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
                <CodeBlock
                  code={output}
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

      {!hasContent && hasResult ? (
        <div className="tool-output tool-output-empty">
          <span>{t('components.readExecution.empty', 'Empty file')}</span>
        </div>
      ) : null}
    </div>
  )
}
