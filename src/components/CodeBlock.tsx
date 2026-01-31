import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import hljs from 'highlight.js'
import { getLanguageFromPath } from '../utils/markdown'

interface CodeBlockProps {
  code: string
  language?: string
  filename?: string
  showLineNumbers?: boolean
}

export default function CodeBlock({ code, language, filename, showLineNumbers = true }: CodeBlockProps) {
  const { t } = useTranslation()
  const codeRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (codeRef.current) {
      const lang = language || (filename ? getLanguageFromPath(filename) : undefined)

      if (lang) {
        try {
          hljs.highlightElement(codeRef.current)
        } catch (e) {
          console.warn('Failed to highlight code:', e)
        }
      }
    }
  }, [code, language, filename])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  // 计算行号
  const lines = code.split('\n')
  const lineCount = lines.length

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        {filename && <div className="code-filename">{filename}</div>}
        {language && !filename && <div className="code-language">{language}</div>}
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
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i + 1} className="code-line-number">
                {i + 1}
              </div>
            ))}
          </div>
        )}
        <pre className="code-block">
          <code ref={codeRef} className={language || ''}>
            {code}
          </code>
        </pre>
      </div>
    </div>
  )
}