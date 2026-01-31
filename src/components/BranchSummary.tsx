import { formatDate } from '../utils/format'
import { useTranslation } from 'react-i18next'
import MarkdownContent from './MarkdownContent'

interface BranchSummaryProps {
  summary?: string
  timestamp?: string
}

export default function BranchSummary({ summary, timestamp }: BranchSummaryProps) {
  const { t } = useTranslation()
  return (
    <div className="branch-summary">
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
      <div className="branch-summary-header">{t('components.branchSummary.header')}</div>
      {summary && (
        <div className="markdown-content">
          <MarkdownContent content={summary} />
        </div>
      )}
    </div>
  )
}