import { useState } from 'react'
import { escapeHtml, getLanguageFromPath } from '../utils/markdown'
import { shortenPath } from '../utils/format'
import CodeBlock from './CodeBlock'

interface WriteExecutionProps {
  filePath: string
  content: string
  output?: string
  timestamp?: string
}

export default function WriteExecution({
  filePath,
  content,
  output,
  timestamp
}: WriteExecutionProps) {
  const [expanded] = useState(false)

  const lang = getLanguageFromPath(filePath)
  const displayPath = shortenPath(filePath)
  const lines = content.split('\n')

  return (
    <div className="tool-execution success">
      {timestamp && <div className="message-timestamp">{timestamp}</div>}
      <div className="tool-header">
        <span className="tool-name">write</span>
        <span className="tool-path">{escapeHtml(displayPath)}</span>
        {lines.length > 20 && <span className="line-count">({lines.length} lines)</span>}
      </div>

      {/* Content to write */}
      {content && (
        <div className={`tool-output ${lines.length > 20 ? 'expandable' : ''} ${expanded ? 'expanded' : ''}`}>
          {lines.length > 20 ? (
            <>
              <div className="output-preview">
                <CodeBlock code={lines.slice(0, 20).join('\n')} language={lang} />
                <div className="expand-hint">... ({lines.length - 20} more lines)</div>
              </div>
              <div className="output-full">
                <CodeBlock code={content} language={lang} />
              </div>
            </>
          ) : (
            <CodeBlock code={content} language={lang} />
          )}
        </div>
      )}

      {/* Output message */}
      {output && (
        <div className="tool-output">
          <div>{escapeHtml(output)}</div>
        </div>
      )}
    </div>
  )
}