import { useState } from 'react'
import { escapeHtml } from '../utils/markdown'
import { replaceTabs, shortenPath } from '../utils/format'
import HoverPreview from './HoverPreview'

interface EditExecutionProps {
  filePath: string
  diff?: string
  output?: string
  timestamp?: string
}

export default function EditExecution({
  filePath,
  diff,
  output,
  timestamp
}: EditExecutionProps) {
  const [expanded, setExpanded] = useState(false)

  const displayPath = shortenPath(filePath)

  const renderDiff = (diffText: string) => {
    const lines = diffText.split('\n')
    return lines.map((line, idx) => {
      let className = 'diff-context'
      if (line.startsWith('+')) {
        className = 'diff-added'
      } else if (line.startsWith('-')) {
        className = 'diff-removed'
      }
      return (
        <div key={idx} className={className}>
          {escapeHtml(replaceTabs(line))}
        </div>
      )
    })
  }

  const diffLines = diff ? diff.split('\n') : []
  const previewDiffLines = diffLines.slice(0, 20)
  const remainingDiffLines = diffLines.length - 20

  return (
    <div className="tool-execution success">
      {timestamp && <div className="message-timestamp">{timestamp}</div>}
      <div className="tool-header">
        <span className="tool-name">
          <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Edit
        </span>
        <span className="tool-path">{escapeHtml(displayPath)}</span>
      </div>

      {diff && (
        <div className="tool-diff">
          {diffLines.length > 20 && !expanded ? (
            <>
              {previewDiffLines.map((line, idx) => {
                let className = 'diff-context'
                if (line.startsWith('+')) {
                  className = 'diff-added'
                } else if (line.startsWith('-')) {
                  className = 'diff-removed'
                }
                return (
                  <div key={idx} className={className}>
                    {escapeHtml(replaceTabs(line))}
                  </div>
                )
              })}
              <HoverPreview
                content={
                  <div 
                    className="expand-hint"
                    onClick={() => setExpanded(true)}
                    style={{ cursor: 'pointer' }}
                  >
                    ... {remainingDiffLines} more lines
                  </div>
                }
                previewContent={
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {renderDiff(diff)}
                  </div>
                }
              />
            </>
          ) : (
            renderDiff(diff)
          )}
          {diffLines.length > 20 && expanded && (
            <div 
              className="expand-hint"
              onClick={() => setExpanded(false)}
              style={{ cursor: 'pointer' }}
            >
              Show less
            </div>
          )}
        </div>
      )}

      {output && (
        <div className="tool-output">
          <div>{escapeHtml(output)}</div>
        </div>
      )}

      {!diff && !output && (
        <div className="tool-output" style={{ color: '#6a6f85', fontStyle: 'italic' }}>
          No changes
        </div>
      )}
    </div>
  )
}