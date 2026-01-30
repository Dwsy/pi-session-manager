import { useState } from 'react'
import { escapeHtml } from '../utils/markdown'
import { formatTokens } from '../utils/format'

interface CompactionProps {
  tokensBefore?: number
  summary?: string
}

export default function Compaction({ tokensBefore, summary }: CompactionProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`compaction ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded(!expanded)}
      style={{ cursor: 'pointer' }}
    >
      <div className="compaction-label">[compaction]</div>
      <div className="compaction-collapsed">
        Compacted from {tokensBefore ? formatTokens(tokensBefore) : '0'} tokens
      </div>
      <div className="compaction-content">
        <strong>Compacted from {tokensBefore ? formatTokens(tokensBefore) : '0'} tokens</strong>
        {'\n\n'}
        {summary ? escapeHtml(summary) : ''}
      </div>
    </div>
  )
}