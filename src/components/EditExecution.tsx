import { useState } from 'react'
import { escapeHtml, replaceTabs } from '../utils/markdown'
import { shortenPath } from '../utils/format'

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
        <span className="tool-name">edit</span>
        <span className="tool-path">{escapeHtml(displayPath)}</span>
      </div>

      {/* Diff display */}
      {diff && (
        <div className={`tool-diff ${diffLines.length > 20 ? 'expandable' : ''} ${expanded ? 'expanded' : ''}`}>
          {diffLines.length > 20 ? (
            <>
              <div className="diff-preview">
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
                <div className="expand-hint">... ({remainingDiffLines} more lines)</div>
              </div>
              <div className="diff-full">
                {renderDiff(diff)}
              </div>
            </>
          ) : (
            renderDiff(diff)
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