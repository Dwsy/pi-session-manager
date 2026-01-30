import type { LegacySessionStats } from '../types'
import { formatDate, formatTokens } from '../utils/format'
import { escapeHtml } from '../utils/markdown'

interface SessionHeaderProps {
  sessionId?: string
  timestamp?: string
  stats: LegacySessionStats
}

export default function SessionHeader({ sessionId, timestamp, stats }: SessionHeaderProps) {
  const totalCost = stats.cost.input + stats.cost.output + stats.cost.cacheRead + stats.cost.cacheWrite

  const tokenParts = []
  if (stats.tokens.input) tokenParts.push(`↑${formatTokens(stats.tokens.input)}`)
  if (stats.tokens.output) tokenParts.push(`↓${formatTokens(stats.tokens.output)}`)
  if (stats.tokens.cacheRead) tokenParts.push(`R${formatTokens(stats.tokens.cacheRead)}`)
  if (stats.tokens.cacheWrite) tokenParts.push(`W${formatTokens(stats.tokens.cacheWrite)}`)

  const msgParts = []
  if (stats.userMessages) msgParts.push(`${stats.userMessages} user`)
  if (stats.assistantMessages) msgParts.push(`${stats.assistantMessages} assistant`)
  if (stats.toolResults) msgParts.push(`${stats.toolResults} tool results`)
  if (stats.customMessages) msgParts.push(`${stats.customMessages} custom`)
  if (stats.compactions) msgParts.push(`${stats.compactions} compactions`)
  if (stats.branchSummaries) msgParts.push(`${stats.branchSummaries} branch summaries`)

  return (
    <div className="session-header">
      <h1>Session: {escapeHtml(sessionId || 'unknown')}</h1>
      <div className="session-meta">
        <div className="info-item">
          <span className="info-label">Date:</span>
          <span className="info-value">{timestamp ? formatDate(timestamp) : 'unknown'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Models:</span>
          <span className="info-value">{stats.models.join(', ') || 'unknown'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Messages:</span>
          <span className="info-value">{msgParts.join(', ') || '0'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Tool Calls:</span>
          <span className="info-value">{stats.toolCalls}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Tokens:</span>
          <span className="info-value">{tokenParts.join(' ') || '0'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Cost:</span>
          <span className="info-value">${totalCost.toFixed(3)}</span>
        </div>
      </div>
    </div>
  )
}