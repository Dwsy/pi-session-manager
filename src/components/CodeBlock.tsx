import { useEffect, useRef } from 'react'
import hljs from 'highlight.js'
import { getLanguageFromPath } from '../utils/markdown'

interface CodeBlockProps {
  code: string
  language?: string
  filename?: string
}

export default function CodeBlock({ code, language, filename }: CodeBlockProps) {
  const codeRef = useRef<HTMLElement>(null)

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

  return (
    <pre className="code-block">
      {filename && <div className="code-filename">{filename}</div>}
      <code ref={codeRef} className={language || ''}>
        {code}
      </code>
    </pre>
  )
}