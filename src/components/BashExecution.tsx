import { useState } from 'react'
import { escapeHtml } from '../utils/markdown'
import ExpandableOutput from './ExpandableOutput'

interface BashExecutionProps {
  command: string
  output?: string
  exitCode?: number | null
  cancelled?: boolean
  timestamp?: string
  entryId: string
}

export default function BashExecution({
  command,
  output,
  exitCode,
  cancelled,
  timestamp,
  entryId,
}: BashExecutionProps) {
  const isError = cancelled || (exitCode !== undefined && exitCode !== null && exitCode !== 0)
  const statusClass = isError ? 'error' : 'success'
  
  const [commandCopied, setCommandCopied] = useState(false)
  const [outputCopied, setOutputCopied] = useState(false)

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCommandCopied(true)
      setTimeout(() => setCommandCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy command:', err)
    }
  }

  const handleCopyOutput = async () => {
    try {
      if (output) {
        await navigator.clipboard.writeText(output)
        setOutputCopied(true)
        setTimeout(() => setOutputCopied(false), 2000)
      }
    } catch (err) {
      console.error('Failed to copy output:', err)
    }
  }

  return (
    <div className={`tool-execution ${statusClass}`} id={`entry-${entryId}`}>
      {timestamp && <div className="message-timestamp">{timestamp}</div>}
      <div className="tool-header">
        <span className="tool-name">
          <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Bash
        </span>
        {exitCode !== undefined && exitCode !== null && (
          <span className="tool-meta" style={{ color: exitCode === 0 ? '#b5bd68' : '#cc6666' }}>
            exit {exitCode}
          </span>
        )}
        {cancelled && (
          <span className="tool-meta" style={{ color: '#ffff00' }}>
            cancelled
          </span>
        )}
      </div>
      <div className="tool-command-wrapper">
        <div className="tool-command">$ {escapeHtml(command)}</div>
        <button
          onClick={handleCopyCommand}
          className="tool-copy-button"
          title={commandCopied ? 'Copied!' : 'Copy command'}
        >
          {commandCopied ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
      </div>
      {output && (
        <div className="tool-output-wrapper">
          <div className="tool-output-header">
            <span className="tool-output-label">Output</span>
            <button
              onClick={handleCopyOutput}
              className="tool-copy-button"
              title={outputCopied ? 'Copied!' : 'Copy output'}
            >
              {outputCopied ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
          <div className="tool-output">
            <ExpandableOutput text={output} maxLines={20} />
          </div>
        </div>
      )}
    </div>
  )
}