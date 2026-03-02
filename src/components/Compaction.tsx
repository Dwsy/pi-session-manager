import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import MarkdownContent from './MarkdownContent'
import { formatTokens } from '../utils/format'

interface CompactionProps {
  tokensBefore?: number
  summary?: string
}

export default function Compaction({ tokensBefore, summary }: CompactionProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`compaction ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
      style={{ cursor: 'pointer' }}
    >
      <div className="compaction-label">{t('components.compaction.label')}</div>
      <div className="compaction-collapsed">
        {t('components.compaction.collapsed', { tokens: formatTokens(tokensBefore || 0) })}
      </div>
      <div className="compaction-content">
        <div className="compaction-content-header">
          {t('components.compaction.content', { tokens: formatTokens(tokensBefore || 0) })}
        </div>
        {summary ? <MarkdownContent content={summary} /> : null}
      </div>
    </div>
  )
}
