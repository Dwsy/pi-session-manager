import { formatDate } from '../utils/format'
import MarkdownContent from './MarkdownContent'

interface BranchSummaryProps {
  summary?: string
  timestamp?: string
}

export default function BranchSummary({ summary, timestamp }: BranchSummaryProps) {
  return (
    <div className="branch-summary">
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
      <div className="branch-summary-header">Branch Summary</div>
      {summary && (
        <div className="markdown-content">
          <MarkdownContent content={summary} />
        </div>
      )}
    </div>
  )
}