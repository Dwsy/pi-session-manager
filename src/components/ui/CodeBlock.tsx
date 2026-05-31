import { memo, useMemo } from 'react'
import { getLanguageFromPath, renderCodeHtml } from '@/utils/markdown'
import { highlightSearchInHTML } from '@/utils/search'
import { useResolvedCodeTheme } from '@/hooks/useResolvedCodeTheme'

interface CodeBlockProps {
  code: string
  language?: string
  filename?: string
  showLineNumbers?: boolean
  maxHeight?: number | string
  scrollable?: boolean
  searchQuery?: string
}

function CodeBlock({
  code,
  language,
  filename,
  showLineNumbers = true,
  maxHeight,
  scrollable = false,
  searchQuery = '',
}: CodeBlockProps) {
  const resolvedLanguage = useMemo(
    () => language || (filename ? getLanguageFromPath(filename) : undefined),
    [filename, language],
  )

  // Subscribe to theme changes so Shiki re-highlights on dark/light toggle
  const resolvedTheme = useResolvedCodeTheme()

  const highlightedCode = useMemo(() => {
    const highlighted = renderCodeHtml(code, resolvedLanguage)
    return searchQuery
      ? highlightSearchInHTML(highlighted, searchQuery)
      : highlighted
  }, [code, resolvedLanguage, searchQuery, resolvedTheme])

  const lineCount = useMemo(() => code.split('\n').length, [code])
  const lineNumbers = useMemo(() => {
    if (!showLineNumbers) {
      return []
    }
    return Array.from({ length: lineCount }, (_, index) => index + 1)
  }, [lineCount, showLineNumbers])
  const wrapperClassName = scrollable
    ? 'code-block-wrapper code-block-scrollable'
    : 'code-block-wrapper'
  const wrapperStyle =
    scrollable && maxHeight !== undefined
      ? { maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }
      : undefined

  return (
    <div className={wrapperClassName} style={wrapperStyle}>
      <div className="code-block-content">
        {showLineNumbers && (
          <div className="code-line-numbers">
            {lineNumbers.map((lineNumber) => (
              <div key={lineNumber} className="code-line-number">
                {lineNumber}
              </div>
            ))}
          </div>
        )}
        <pre className="code-block">
          <code
            className={`shiki ${resolvedLanguage || ''}`.trim()}
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        </pre>
      </div>
    </div>
  )
}

export default memo(CodeBlock)
