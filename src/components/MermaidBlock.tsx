import { useEffect, useMemo, useState } from 'react'
import { renderMermaid, renderMermaidAscii } from 'beautiful-mermaid'

type MermaidRenderMode = 'ascii' | 'svg'

interface MermaidBlockProps {
  code: string
  mode: MermaidRenderMode
}

export default function MermaidBlock({ code, mode }: MermaidBlockProps) {
  const trimmed = code.trim()
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const theme = useMemo(() => {
    const darkTheme = {
      bg: '#161a22',
      fg: '#e4e7ee',
      line: '#3b4458',
      accent: '#5f87ff',
      muted: '#8e9ab3',
      surface: '#1d2430',
      border: '#2f3a4d',
    }
    const lightTheme = {
      bg: '#f7f8fb',
      fg: '#1f2937',
      line: '#c6cedd',
      accent: '#355ad8',
      muted: '#64748b',
      surface: '#eef2f9',
      border: '#c6cedd',
    }

    if (typeof window === 'undefined') {
      return darkTheme
    }

    const root = document.documentElement
    const isLight = root.classList.contains('theme-light')
    return isLight ? lightTheme : darkTheme
  }, [])

  const asciiResult = useMemo(() => {
    if (mode !== 'ascii' || !trimmed) {
      return { value: '', error: null }
    }
    try {
      return { value: renderMermaidAscii(trimmed), error: null }
    } catch (err) {
      return { value: '', error: err instanceof Error ? err.message : String(err) }
    }
  }, [mode, trimmed])

  useEffect(() => {
    if (mode !== 'svg' || !trimmed) {
      setSvg('')
      setError(null)
      setIsLoading(false)
      return
    }

    let isActive = true
    setIsLoading(true)
    setError(null)

    renderMermaid(trimmed, theme)
      .then((output) => {
        if (!isActive) return
        setSvg(output)
      })
      .catch((err) => {
        if (!isActive) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!isActive) return
        setIsLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [mode, trimmed])

  if (!trimmed) {
    return null
  }

  if (mode === 'ascii') {
    if (asciiResult.error) {
      return (
        <div className="mermaid-block mermaid-error">
          Mermaid 渲染失败：{asciiResult.error}
        </div>
      )
    }

    return (
      <pre className="mermaid-block mermaid-ascii">
        {asciiResult.value}
      </pre>
    )
  }

  if (error) {
    return (
      <div className="mermaid-block mermaid-error">
        Mermaid 渲染失败：{error}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="mermaid-block mermaid-loading">
        Mermaid 正在渲染...
      </div>
    )
  }

  return (
    <div
      className="mermaid-block mermaid-svg"
      aria-label="Mermaid diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
