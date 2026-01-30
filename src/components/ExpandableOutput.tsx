import { useState } from 'react'
import { escapeHtml } from '../utils/markdown'
import CodeBlock from './CodeBlock'

interface ExpandableOutputProps {
  text: string
  maxLines?: number
  language?: string
  code?: boolean
}

export default function ExpandableOutput({
  text,
  maxLines = 20,
  language,
  code = false
}: ExpandableOutputProps) {
  const [expanded, setExpanded] = useState(false)

  const lines = text.split('\n')
  const previewLines = lines.slice(0, maxLines)
  const remaining = lines.length - maxLines

  const renderContent = (content: string) => {
    if (code && language) {
      return <CodeBlock code={content} language={language} />
    }
    return content.split('\n').map((line, idx) => (
      <div key={idx}>{escapeHtml(line)}</div>
    ))
  }

  if (remaining <= 0) {
    return (
      <div className="tool-output">
        {renderContent(text)}
      </div>
    )
  }

  return (
    <div
      className={`tool-output expandable ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
      style={{ cursor: 'pointer' }}
    >
      <div className="output-preview">
        {renderContent(previewLines.join('\n'))}
        <div className="expand-hint">... ({remaining} more lines)</div>
      </div>
      <div className="output-full">
        {renderContent(text)}
      </div>
    </div>
  )
}