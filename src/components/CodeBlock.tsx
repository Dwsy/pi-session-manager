import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getLanguageFromPath, renderCodeHtml } from '../utils/markdown'
import { highlightSearchInHTML } from '../utils/search'

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
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const resolvedLanguage = useMemo(
    () => language || (filename ? getLanguageFromPath(filename) : undefined),
    [filename, language],
  )

  const highlightedCode = useMemo(() => {
    const highlighted = renderCodeHtml(code, resolvedLanguage)
    return searchQuery
      ? highlightSearchInHTML(highlighted, searchQuery)
      : highlighted
  }, [code, resolvedLanguage, searchQuery])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

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
      <div className="code-block-header">
        {filename && <div className="code-filename">{filename}</div>}
        {resolvedLanguage && !filename && (
          <div className="code-language">{resolvedLanguage}</div>
        )}
        <button
          onClick={handleCopy}
          className="code-copy-button"
          title={copied ? t('components.codeBlock.copied') : t('components.codeBlock.copy')}
        >
          {copied ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
          <span className="code-copy-text">
            {copied ? t('components.codeBlock.copied') : t('components.codeBlock.copy')}
          </span>
        </button>
      </div>
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
            className={`hljs ${resolvedLanguage || ''}`.trim()}
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        </pre>
      </div>
    </div>
  )
}

export default memo(CodeBlock)
