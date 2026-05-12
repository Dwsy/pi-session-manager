import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MultiFileDiff, type FileContents } from '@pierre/diffs/react'
import { registerCustomTheme, RegisteredCustomThemes } from '@pierre/diffs'
import type { Content } from '@/types'
import type { ToolRenderPlugin, ToolRenderProps, ResolvedToolData } from '@/plugins/tools-render/types'
import { defaultResolveData } from '@/plugins/tools-render/utils/resolveData'
import { escapeHtml } from '@/utils/markdown'
import { shortenPath } from '@/utils/format'
import { getPathBasename } from '@/utils/path'
import { highlightSearchInHTML } from '@/utils/search'

// Register custom diff viewer themes (light/dark) with transparent background
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

/**
 * Edit tool execution renderer
 * Displays file diff using Pierre diff viewer
 */
function EditExecution({
  resolvedData,
  searchQuery,
  context,
}: ToolRenderProps) {
  const { t } = useTranslation()
  const { args, diff, output, isError, entryId } = resolvedData
  const { isExpanded, toggleExpanded, theme, isMobile, disableSuccessStyle } = context

  const filePath = args.file_path || args.path || ''
  const isDark = theme === 'dark'

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
    if (!diff) return ''
    const escapedDiff = escapeHtml(diff)
    return searchQuery ? highlightSearchInHTML(escapedDiff, searchQuery) : escapedDiff
  }, [diff, searchQuery])

  const highlightedOutput = useMemo(() => {
    if (!output) return ''
    const escapedOutput = escapeHtml(output)
    return searchQuery ? highlightSearchInHTML(escapedOutput, searchQuery) : escapedOutput
  }, [output, searchQuery])

  /**
   * Parse Pi diff format into old/new text
   * Pi diff format: "+ lineNum content" for additions, "- lineNum content" for deletions
   */
  const parsePiDiff = (diffText: string): { oldText: string; newText: string } | null => {
    if (!diffText) return null

    try {
      const lines = diffText.split('\n')
      const oldLines: string[] = []
      const newLines: string[] = []

      for (const line of lines) {
        if (line.trim() === '...') continue
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

      return { oldText: oldLines.join('\n'), newText: newLines.join('\n') }
    } catch (error) {
      console.error('Error parsing Pi diff:', error)
      return null
    }
  }

  /**
   * Render diff using Pierre diff viewer or fallback to plain text
   */
  const renderDiff = () => {
    if (!diff) return null

    // When searching, show highlighted plain text instead of diff viewer
    if (searchQuery?.trim()) {
      return (
        <div className="tool-output">
          <div style={{
            backgroundColor: 'var(--code-bg, #1e1e2e)',
            padding: '12px',
            borderRadius: '6px',
            overflow: 'auto'
          }}>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-family-mono, ui-monospace, monospace)',
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
          <pre>{diff}</pre>
        </div>
      )
    }

    try {
      const fileName = getPathBasename(filePath) || 'file'
      const oldFile: FileContents = { name: fileName, contents: parsed.oldText }
      const newFile: FileContents = { name: fileName, contents: parsed.newText }

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
          <pre>{diff}</pre>
        </div>
      )
    }
  }

  const shouldShowOutput = Boolean(isError && output)
  const hasContent = Boolean(diff || shouldShowOutput)
  const statusClass = isError ? 'error' : disableSuccessStyle ? '' : 'success'

  return (
    <div className={`tool-execution ${statusClass}`} id={`entry-${entryId}`}>
      <div
        className={`tool-header ${hasContent ? 'cursor-pointer select-none' : ''}`}
        onClick={hasContent ? toggleExpanded : undefined}
      >
        {hasContent && (
          <span className="tool-expand-indicator">
            {isExpanded ? '▾' : '▸'}
          </span>
        )}
        <div className="tool-header-meta">
          <span className="tool-name">
            <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Edit
          </span>
        </div>
        <span className="tool-path" style={desktopPathStyle}>{escapeHtml(displayPath)}</span>
      </div>

      {diff && (
        <div className={`tool-diff-wrapper collapsible ${isExpanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded && (
              <div>
                {renderDiff()}
              </div>
            )}
          </div>
        </div>
      )}

      {shouldShowOutput && (
        <div className={`tool-output-wrapper collapsible ${isExpanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded && (
              <div className="tool-output">
                <div dangerouslySetInnerHTML={{ __html: highlightedOutput }} />
              </div>
            )}
          </div>
        </div>
      )}

      {!hasContent && (
        <div className="tool-output" style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
          {t('components.editExecution.noChanges', 'No changes')}
        </div>
      )}
    </div>
  )
}

/**
 * Generate search segments for edit tool
 * Includes diff content and error output
 */
function getEditSearchSegments(_toolCall: Content, resolvedData: ResolvedToolData): string[] {
  const segments: string[] = []

  if (resolvedData.diff) {
    segments.push(escapeHtml(resolvedData.diff))
  }

  if (resolvedData.output) {
    segments.push(escapeHtml(resolvedData.output))
  }

  return segments
}

/** Edit tool render plugin definition */
export const editToolPlugin: ToolRenderPlugin = {
  id: 'builtin-edit',
  name: 'Edit',
  match: 'edit',
  priority: 100,
  component: EditExecution,
  resolveData: defaultResolveData,
  getSearchSegments: getEditSearchSegments,
  getPreview: (_toolCall, data) => {
    const path = data.args.file_path || data.args.path || ''
    return `Edit: ${path}`
  },
}
