import { useState } from 'react'
import { escapeHtml } from '../utils/markdown'
import HoverPreview from './HoverPreview'

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
  const [argsExpanded, setArgsExpanded] = useState(false)
  const [outputExpanded, setOutputExpanded] = useState(false)

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
      {timestamp && <div className="message-timestamp">{timestamp}</div>}
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
        <>
          <div className="tool-arguments-title">Arguments</div>
          <div className="tool-arguments">
            {argsRemaining > 0 && !argsExpanded ? (
              <>
                <pre><code>{escapeHtml(argsLines.slice(0, 10).join('\n'))}</code></pre>
                <HoverPreview
                  content={
                    <div 
                      className="expand-hint"
                      onClick={() => setArgsExpanded(true)}
                      style={{ cursor: 'pointer' }}
                    >
                      ... {argsRemaining} more lines
                    </div>
                  }
                  previewContent={
                    <pre><code>{escapeHtml(argsText)}</code></pre>
                  }
                />
              </>
            ) : (
              <pre><code>{escapeHtml(argsText)}</code></pre>
            )}
            {argsRemaining > 0 && argsExpanded && (
              <div 
                className="expand-hint"
                onClick={() => setArgsExpanded(false)}
                style={{ cursor: 'pointer' }}
              >
                Show less
              </div>
            )}
          </div>
        </>
      )}

      {output && (
        <div className="tool-output">
          {outputRemaining > 0 && !outputExpanded ? (
            <>
              {outputLines.slice(0, 20).map((line, idx) => (
                <div key={idx}>{escapeHtml(line)}</div>
              ))}
              <HoverPreview
                content={
                  <div 
                    className="expand-hint"
                    onClick={() => setOutputExpanded(true)}
                    style={{ cursor: 'pointer' }}
                  >
                    ... {outputRemaining} more lines
                  </div>
                }
                previewContent={
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {outputLines.map((line, idx) => (
                      <div key={idx}>{escapeHtml(line)}</div>
                    ))}
                  </div>
                }
              />
            </>
          ) : (
            outputLines.map((line, idx) => (
              <div key={idx}>{escapeHtml(line)}</div>
            ))
          )}
          {outputRemaining > 0 && outputExpanded && (
            <div 
              className="expand-hint"
              onClick={() => setOutputExpanded(false)}
              style={{ cursor: 'pointer' }}
            >
              Show less
            </div>
          )}
        </div>
      )}
    </div>
  )
}