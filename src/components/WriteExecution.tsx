import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { escapeHtml, getLanguageFromPath } from '../utils/markdown'
import { shortenPath } from '../utils/format'
import { useIsMobile } from '../hooks/useIsMobile'
import { useSessionView } from '../contexts/SessionViewContext'
import { highlightSearchInHTML } from '../utils/search'
import CodeBlock from './CodeBlock'

interface WriteExecutionProps {
  filePath: string
  content: string
  output?: string
  entryId: string
  searchQuery?: string
}

const OUTPUT_MAX_HEIGHT = 300

export default function WriteExecution({
  filePath,
  content,
  output,
  entryId,
  searchQuery = '',
}: WriteExecutionProps) {
  const { t } = useTranslation()
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
    if (!output) {
      return ''
    }

    const escapedOutput = escapeHtml(output)
    return searchQuery
      ? highlightSearchInHTML(escapedOutput, searchQuery)
      : escapedOutput
  }, [output, searchQuery])

  return (
    <div className="tool-execution success" id={`entry-${entryId}`}>
      <div
        className="tool-header cursor-pointer select-none"
        onClick={() => toggleToolExpanded(entryId)}
      >
        <span className="tool-expand-indicator">
          {expanded ? '▾' : '▸'}
        </span>
        <div className="tool-header-meta">
          <span className="tool-name">
            <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Write
          </span>
        </div>
        <span className="tool-path" style={desktopPathStyle}>{escapeHtml(displayPath)}</span>
        <span className="tool-meta">({lines.length} {t('components.writeExecution.lines')})</span>
      </div>

      {content && (
        <div className={`tool-output-wrapper collapsible ${expanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
            {expanded && (
              <div className="tool-output">
                <CodeBlock
                  code={content}
                  language={lang}
                  showLineNumbers={true}
                  scrollable
                  maxHeight={OUTPUT_MAX_HEIGHT}
                  searchQuery={searchQuery}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {output && (
        <div className={`tool-output-wrapper collapsible ${expanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
            {expanded && (
              <div className="tool-output">
                <div dangerouslySetInnerHTML={{ __html: highlightedOutput }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
