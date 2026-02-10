import { useState, useEffect } from 'react'
import { escapeHtml } from '../utils/markdown'
import { formatDate } from '../utils/format'

interface GenericToolCallProps {
  name: string
  arguments?: Record<string, any>
  output?: string
  isError?: boolean
  timestamp?: string
  expanded?: boolean
}

export default function GenericToolCall({
  name,
  arguments: args,
  output,
  isError = false,
  timestamp,
  expanded = false,
}: GenericToolCallProps) {
  const [argsExpanded, setArgsExpanded] = useState(false)
  const [outputExpanded, setOutputExpanded] = useState(false)

  useEffect(() => {
    setArgsExpanded(expanded)
    setOutputExpanded(expanded)
  }, [expanded])

  const statusClass = isError ? 'error' : 'success'

  const formatArgs = (obj: Record<string, any>): string => {
    return JSON.stringify(obj, null, 2)
  }

  const argsText = args ? formatArgs(args) : ''
  const argsLines = argsText.split('\n')
  const argsRemaining = argsLines.length - 10

  const outputLines = output ? output.split('\n') : []
  const outputRemaining = outputLines.length - 20

  return (
    <div className={`tool-execution ${statusClass}`}>
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
      <div className="tool-header">
        <span className="tool-name">
          <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {escapeHtml(name)}
        </span>
      </div>

      {args && Object.keys(args).length > 0 && (
        <div className="tool-output-wrapper" style={{ marginTop: '8px' }}>
          {argsRemaining > 0 ? (
            <>
              <div
                className="tool-output-header"
                onClick={() => setArgsExpanded(!argsExpanded)}
                style={{ cursor: 'pointer' }}
              >
                <span className="tool-output-label">
                  {argsExpanded ? '▾ Arguments' : `▸ Arguments (${argsRemaining} more lines)`}
                </span>
              </div>
              <div className="tool-arguments" style={{ margin: 0 }}>
                {argsExpanded ? (
                  <pre><code>{escapeHtml(argsText)}</code></pre>
                ) : (
                  <pre><code>{escapeHtml(argsLines.slice(0, 10).join('\n'))}</code></pre>
                )}
              </div>
            </>
          ) : (
            <div className="tool-arguments" style={{ margin: '0 12px 12px 12px' }}>
              <pre><code>{escapeHtml(argsText)}</code></pre>
            </div>
          )}
        </div>
      )}

      {output && (
        <div className="tool-output-wrapper">
          {outputRemaining > 0 ? (
            <>
              <div
                className="tool-output-header"
                onClick={() => setOutputExpanded(!outputExpanded)}
                style={{ cursor: 'pointer' }}
              >
                <span className="tool-output-label">
                  {outputExpanded ? '▾ Output' : `▸ Output (${outputRemaining} more lines)`}
                </span>
              </div>
              <div className="tool-output">
                {outputExpanded ? (
                  outputLines.map((line, idx) => (
                    <div key={idx}>{escapeHtml(line)}</div>
                  ))
                ) : (
                  outputLines.slice(0, 20).map((line, idx) => (
                    <div key={idx}>{escapeHtml(line)}</div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="tool-output" style={{ paddingTop: '8px' }}>
              {outputLines.map((line, idx) => (
                <div key={idx}>{escapeHtml(line)}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}