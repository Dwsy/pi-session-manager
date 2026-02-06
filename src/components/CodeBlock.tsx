import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { codeToHtml } from 'shiki'
import { getLanguageFromPath } from '../utils/markdown'
import { useCodeTheme } from '../hooks/useCodeTheme'

interface CodeBlockProps {
  code: string
  language?: string
  filename?: string
  showLineNumbers?: boolean
}

export default function CodeBlock({ code, language, filename, showLineNumbers = true }: CodeBlockProps) {
  const { t } = useTranslation()
  const codeRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [highlightedHtml, setHighlightedHtml] = useState<string>('')
  const theme = useCodeTheme()
  
  const resolvedLanguage = useMemo(() => {
    const rawLanguage = (language || (filename ? getLanguageFromPath(filename) : '') || '').trim()
    return rawLanguage || 'text'
  }, [language, filename])

  useEffect(() => {
    const highlight = async () => {
      try {
        const html = await codeToHtml(code, {
          lang: resolvedLanguage,
          theme: theme,
          rootStyle: false, // 移除背景色
        })
        setHighlightedHtml(html)
      } catch (e) {
        console.warn('Failed to highlight code:', e)
        setHighlightedHtml(`<pre><code>${escapeHtml(code)}</code></pre>`)
      }
    }
    highlight()
  }, [code, resolvedLanguage, theme])

  useEffect(() => {
    const container = codeRef.current
    if (!container) return
    const highlightedNodes = container.querySelectorAll<HTMLElement>('code[data-highlighted]')
    highlightedNodes.forEach((node) => {
      node.removeAttribute('data-highlighted')
    })
  }, [highlightedHtml])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy code:', err)
    }
  }

  const escapeHtml = (text: string): string => {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
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
        <div ref={codeRef} className="code-block-shiki" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      </div>
    </div>
  )
}
