import { useState } from 'react'
import { escapeHtml } from '../utils/markdown'

interface GenericToolCallProps {
  name: string
  arguments?: Record<string, any>
  output?: string
  isError?: boolean
  timestamp?: string
}

export default function GenericToolCall({
  name,
  arguments: args,
  output,
  isError = false,
  timestamp
}: GenericToolCallProps) {
  const [expanded] = useState(false)

  const statusClass = isError ? 'error' : 'success'

  // Format arguments for display
  const formatArgs = (obj: Record<string, any>): string => {
    return JSON.stringify(obj, null, 2)
  }

  const argsText = args ? formatArgs(args) : ''
  const outputLines = output ? output.split('\n') : []
  const previewLines = outputLines.slice(0, 20)
  const remaining = outputLines.length - 20

  return (
    <div className={`tool-execution ${statusClass}`}>
      {timestamp && <div className="message-timestamp">{timestamp}</div>}
      <div className="tool-header">
        <span className="tool-name">{escapeHtml(name)}</span>
      </div>

      {/* Arguments */}
      {args && (
        <div className={`tool-output ${argsText.length > 200 ? 'expandable' : ''} ${expanded ? 'expanded' : ''}`}>
          {argsText.length > 200 ? (
            <>
              <div className="output-preview">
                <pre><code>{escapeHtml(argsText.substring(0, 200))}</code></pre>
                <div className="expand-hint">... (more)</div>
              </div>
              <div className="output-full">
                <pre><code>{escapeHtml(argsText)}</code></pre>
              </div>
            </>
          ) : (
            <pre><code>{escapeHtml(argsText)}</code></pre>
          )}
        </div>
      )}

      {/* Output */}
      {output && (
        <div className={`tool-output ${remaining > 0 ? 'expandable' : ''} ${expanded ? 'expanded' : ''}`}>
          {remaining > 0 ? (
            <>
              <div className="output-preview">
                {previewLines.map((line, idx) => (
                  <div key={idx}>{escapeHtml(line)}</div>
                ))}
                <div className="expand-hint">... ({remaining} more lines)</div>
              </div>
              <div className="output-full">
                {outputLines.map((line, idx) => (
                  <div key={idx}>{escapeHtml(line)}</div>
                ))}
              </div>
            </>
          ) : (
            outputLines.map((line, idx) => (
              <div key={idx}>{escapeHtml(line)}</div>
            ))
          )}
        </div>
      )}
    </div>
  )
}