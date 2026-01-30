import { useState } from 'react'
import { escapeHtml, getLanguageFromPath } from '../utils/markdown'
import { shortenPath } from '../utils/format'
import CodeBlock from './CodeBlock'

interface ReadExecutionProps {
  filePath: string
  offset?: number
  limit?: number
  output?: string
  images?: Array<{ mimeType: string; data: string }>
  timestamp?: string
}

export default function ReadExecution({
  filePath,
  offset = undefined,
  limit,
  output,
  images = [],
  timestamp
}: ReadExecutionProps) {
  const [expanded] = useState(false)

  const lang = getLanguageFromPath(filePath)
  const displayPath = shortenPath(filePath)

  // Build line number display
  let pathWithLines = displayPath
  if (offset !== undefined || limit !== undefined) {
    const startLine = offset ?? 1
    const endLine = limit !== undefined ? startLine + limit - 1 : ''
    pathWithLines = `${displayPath}:${startLine}${endLine ? '-' + endLine : ''}`
  }

  const lines = output ? output.split('\n') : []
  const previewLines = lines.slice(0, 20)
  const remaining = lines.length - 20

  return (
    <div className="tool-execution success">
      {timestamp && <div className="message-timestamp">{timestamp}</div>}
      <div className="tool-header">
        <span className="tool-name">read</span>
        <span className="tool-path">{escapeHtml(pathWithLines)}</span>
      </div>

      {/* Images */}
      {images.length > 0 && (
        <div className="tool-images">
          {images.map((img, idx) => (
            <img
              key={idx}
              src={`data:${img.mimeType};base64,${img.data}`}
              className="tool-image"
              alt="Read image"
            />
          ))}
        </div>
      )}

      {/* Code output */}
      {output && (
        <div className={`tool-output ${remaining > 0 ? 'expandable' : ''} ${expanded ? 'expanded' : ''}`}>
          {remaining > 0 ? (
            <>
              <div className="output-preview">
                <CodeBlock code={previewLines.join('\n')} language={lang} />
                <div className="expand-hint">... ({remaining} more lines)</div>
              </div>
              <div className="output-full">
                <CodeBlock code={output} language={lang} />
              </div>
            </>
          ) : (
            <CodeBlock code={output} language={lang} />
          )}
        </div>
      )}
    </div>
  )
}