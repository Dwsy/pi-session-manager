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

  return (
    <div className={`tool-execution ${statusClass}`} id={`entry-${entryId}`}>
      {timestamp && <div className="message-timestamp">{timestamp}</div>}
      <div className="tool-command">$ {escapeHtml(command)}</div>
      {output && <ExpandableOutput text={output} maxLines={20} />}
      {cancelled && (
        <div style={{ color: 'var(--warning)' }}>(cancelled)</div>
      )}
      {exitCode !== undefined && exitCode !== null && exitCode !== 0 && !cancelled && (
        <div style={{ color: 'var(--error)' }}>(exit {exitCode})</div>
      )}
    </div>
  )
}