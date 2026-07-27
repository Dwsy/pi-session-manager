import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { MultiFileDiff, type FileContents } from '@pierre/diffs/react'
import { registerCustomTheme, RegisteredCustomThemes } from '@pierre/diffs'
import { useTranslation } from 'react-i18next'
import { escapeHtml } from '@/utils/markdown'
import { shortenPath } from '@/utils/format'
import { getPathBasename } from '@/utils/path'
import { useTheme } from '@/hooks/useAppearance'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSessionView } from '@/contexts/SessionViewContext'
import { useSettings } from '@/hooks/useSettings'
import { useClipboard } from '@/hooks/useClipboard'
import ToolHeader from '@/components/tool-calls/ToolHeader'
import ToolSectionHeader from '@/components/tool-calls/ToolSectionHeader'
import { getToolStatusLabel, type ToolRenderStatus } from '@/plugins/tools-render/utils/status'
import { highlightSearchInHTML } from '@/utils/search'

// Custom themes: inherit pierre themes but override editor.background to match tool card bg
let themesRegistered = false
if (!themesRegistered) {
  themesRegistered = true

  const lightLoader = RegisteredCustomThemes.get('pierre-light')!
  registerCustomTheme('card-light', () =>
    lightLoader().then((r: any) => {
      const base = r.default ?? r
      return { ...base, name: 'card-light', colors: { ...base.colors, 'editor.background': 'transparent' } }
    })
  )

  const darkLoader = RegisteredCustomThemes.get('pierre-dark')!
  registerCustomTheme('card-dark', () =>
    darkLoader().then((r: any) => {
      const base = r.default ?? r
      return { ...base, name: 'card-dark', colors: { ...base.colors, 'editor.background': 'transparent' } }
    })
  )
}

interface EditExecutionProps {
  filePath: string
  diff?: string
  output?: string
  isError?: boolean
  hasResult?: boolean
  entryId: string
  searchQuery?: string
}

const OUTPUT_MAX_HEIGHT = 300

export default function EditExecution({
  filePath,
  diff,
  output,
  isError = false,
  hasResult = true,
  entryId,
  searchQuery = '',
}: EditExecutionProps) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const { isToolExpanded, toggleToolExpanded } = useSessionView()
  const { settings } = useSettings()
  const { copyText } = useClipboard()
  const disableSuccessStyle = settings.appearance.disableToolSuccessStyle
  const expanded = isToolExpanded(entryId)
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

  const highlightedDiff = useMemo(() => {
    if (!diff) {
      return ''
    }

    const escapedDiff = escapeHtml(diff)
    return searchQuery
      ? highlightSearchInHTML(escapedDiff, searchQuery)
      : escapedDiff
  }, [diff, searchQuery])

  const highlightedOutput = useMemo(() => {
    if (!output) {
      return ''
    }

    const escapedOutput = escapeHtml(output)
    return searchQuery
      ? highlightSearchInHTML(escapedOutput, searchQuery)
      : escapedOutput
  }, [output, searchQuery])

  const parsePiDiff = (diffText: string): { oldText: string; newText: string } | null => {
    if (!diffText) return null

    try {
      const lines = diffText.split('\n')
      const oldLines: string[] = []
      const newLines: string[] = []

      for (const line of lines) {
        if (line.trim() === '...') {
          continue
        }

        if (line.trim() === '') {
          oldLines.push('')
          newLines.push('')
          continue
        }

        const lineMatch = line.match(/^([+-]?)\s*\d+\s+(.*)$/)

        if (lineMatch) {
          const [, marker, content] = lineMatch

          if (marker === '-') {
            oldLines.push(content)
          } else if (marker === '+') {
            newLines.push(content)
          } else {
            oldLines.push(content)
            newLines.push(content)
          }
        } else {
          oldLines.push(line)
          newLines.push(line)
        }
      }

      return {
        oldText: oldLines.join('\n'),
        newText: newLines.join('\n')
      }
    } catch (error) {
      console.error('Error parsing Pi diff:', error)
      return null
    }
  }

  const renderDiff = () => {
    if (!diff) return null

    if (searchQuery.trim()) {
      return (
        <div className="tool-output">
          <div style={{
            backgroundColor: 'var(--code-bg, #1e1e1e)',
            padding: '12px',
            borderRadius: '6px',
            overflow: 'auto'
          }}>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-family-mono, ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace)',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              color: 'var(--code-fg, #d4d4d4)'
            }} dangerouslySetInnerHTML={{ __html: highlightedDiff }} />
          </div>
        </div>
      )
    }

    const parsed = parsePiDiff(diff)

    if (!parsed) {
      return (
        <div className="tool-output">
          <div style={{
            backgroundColor: 'var(--code-bg, #1e1e1e)',
            padding: '12px',
            borderRadius: '6px',
            overflow: 'auto'
          }}>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-family-mono, ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace)',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              color: 'var(--code-fg, #d4d4d4)'
            }}>
              {diff}
            </pre>
          </div>
        </div>
      )
    }

    try {
      const fileName = getPathBasename(filePath) || 'file'

      const oldFile: FileContents = {
        name: fileName,
        contents: parsed.oldText,
      }

      const newFile: FileContents = {
        name: fileName,
        contents: parsed.newText,
      }

      return (
        <div className="tool-diff">
          <MultiFileDiff
            oldFile={oldFile}
            newFile={newFile}
            options={{
              theme: { dark: 'card-dark', light: 'card-light' },
              themeType: isDark ? 'dark' : 'light',
              diffStyle: isMobile ? 'unified' : 'split',
              overflow: 'wrap',
            }}
          />
        </div>
      )
    } catch (error) {
      console.error('Error rendering MultiFileDiff:', error)

      return (
        <div className="tool-output">
          <div style={{
            backgroundColor: 'var(--code-bg, #1e1e1e)',
            padding: '12px',
            borderRadius: '6px',
            overflow: 'auto'
          }}>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-family-mono, ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace)',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              color: 'var(--code-fg, #d4d4d4)'
            }}>
              {diff.split('\n').map((line, i) => {
                let color = 'inherit'
                let bgColor = 'transparent'

                if (line.match(/^\s*-\s*\d+/)) {
                  color = '#f85149'
                  bgColor = 'rgba(248, 81, 73, 0.1)'
                } else if (line.match(/^\s*\+\s*\d+/)) {
                  color = '#3fb950'
                  bgColor = 'rgba(63, 185, 80, 0.1)'
                }

                return (
                  <div
                    key={i}
                    style={{
                      color,
                      backgroundColor: bgColor,
                      padding: '0 4px'
                    }}
                  >
                    {line || ' '}
                  </div>
                )
              })}
            </pre>
          </div>
        </div>
      )
    }
  }

  const outputText = output ?? ''
  const shouldShowOutput = Boolean(isError && outputText)
  const hasContent = Boolean(diff || shouldShowOutput)
  const status: ToolRenderStatus = isError
    ? 'error'
    : hasResult
      ? 'success'
      : 'pending'
  const statusClass = status === 'success' && disableSuccessStyle ? '' : status
  const statusLabel = getToolStatusLabel(status, t)

  return (
    <div className={`tool-execution ${statusClass}`.trim()} id={`entry-${entryId}`}>
      <ToolHeader
        expandable={hasContent}
        expanded={expanded}
        onToggle={() => toggleToolExpanded(entryId)}
        ariaLabel={`Edit: ${statusLabel}`}
      >
        {hasContent && (
          <span className="tool-expand-indicator" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        )}
        <span className="tool-header-meta">
          <span className="tool-name">Edit</span>
        </span>
        <span className="tool-path" style={desktopPathStyle}>{displayPath}</span>
        <span className={`tool-status tool-status-${status}`}>{statusLabel}</span>
      </ToolHeader>

      {diff && (
        <div className={`tool-diff-wrapper collapsible ${expanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
            {expanded && (
              <div style={{ maxHeight: OUTPUT_MAX_HEIGHT, overflowY: 'auto' }}>
                <ToolSectionHeader
                  label={t('components.toolCall.diff', 'Diff')}
                  text={diff}
                  copyText={copyText}
                />
                {renderDiff()}
              </div>
            )}
          </div>
        </div>
      )}

      {shouldShowOutput && (
        <div className={`tool-output-wrapper collapsible ${expanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${expanded ? 'expanded' : ''}`}>
            {expanded && (
              <div className="tool-output">
                <ToolSectionHeader
                  label={t('components.toolCall.output', 'Output')}
                  text={outputText}
                  copyText={copyText}
                />
                <pre
                  className="tool-output-plain"
                  dangerouslySetInnerHTML={{ __html: highlightedOutput }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {!hasContent && hasResult && (
        <div className="tool-output tool-output-empty">
          {t('components.editExecution.noChanges')}
        </div>
      )}
    </div>
  )
}
