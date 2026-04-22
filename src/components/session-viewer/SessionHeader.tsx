import { memo } from 'react'
import type { LegacySessionStats } from '@/types'
import { formatDate, formatTokens } from '@/utils/format'
import { escapeHtml } from '@/utils/markdown'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { useClipboard } from '@/hooks/useClipboard'

interface SessionHeaderProps {
  sessionId?: string
  timestamp?: string
  stats: LegacySessionStats
  previewMode?: boolean
  sessionPath?: string
}

function SessionHeader({ sessionId, timestamp, stats, previewMode = false, sessionPath }: SessionHeaderProps) {
  const { t } = useTranslation()
  const { copyText } = useClipboard()
  const totalCost = stats.cost.input + stats.cost.output + stats.cost.cacheRead + stats.cost.cacheWrite

  const tokenParts = []
  if (stats.tokens.input) tokenParts.push(`↑${formatTokens(stats.tokens.input)}`)
  if (stats.tokens.output) tokenParts.push(`↓${formatTokens(stats.tokens.output)}`)
  if (stats.tokens.cacheRead) tokenParts.push(`R${formatTokens(stats.tokens.cacheRead)}`)
  if (stats.tokens.cacheWrite) tokenParts.push(`W${formatTokens(stats.tokens.cacheWrite)}`)

  const msgParts = []
  if (stats.userMessages) msgParts.push(`${stats.userMessages} ${t('session.header.user')}`)
  if (stats.assistantMessages) msgParts.push(`${stats.assistantMessages} ${t('session.header.assistant')}`)
  if (stats.toolResults) msgParts.push(`${stats.toolResults} ${t('session.header.toolResults')}`)
  if (stats.customMessages) msgParts.push(`${stats.customMessages} ${t('session.header.custom')}`)
  if (stats.compactions) msgParts.push(`${stats.compactions} ${t('session.header.compactions')}`)
  if (stats.branchSummaries) msgParts.push(`${stats.branchSummaries} ${t('session.header.branchSummaries')}`)

  const compactModelSummary = stats.models.length <= 1
    ? (stats.models[0] || t('session.header.unknown'))
    : `${stats.models[0]} +${stats.models.length - 1}`

  const handleCopyPath = () => {
    if (sessionPath) {
      void copyText(sessionPath)
    }
  }

  if (previewMode) {
    return (
      <div className="session-header">
        <h1>
          {t('session.header.session')}: {escapeHtml(sessionId || t('session.header.unknown'))}
          {sessionPath && (
            <button
              onClick={handleCopyPath}
              className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
              title={t('session.copyPath', 'Copy JSONL path')}
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
        </h1>
        <div className="session-meta">
          <div className="info-item">
            <span className="info-label">{t('session.header.date')}:</span>
            <span className="info-value">{timestamp ? formatDate(timestamp) : t('session.header.unknown')}</span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('session.header.models')}:</span>
            <span className="info-value">{compactModelSummary}</span>
          </div>
          <div className="info-item">
            <span className="info-label">{t('session.header.messagesLabel')}:</span>
            <span className="info-value">{msgParts.join(', ') || '0'}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="session-header">
      <h1>
        {t('session.header.session')}: {escapeHtml(sessionId || t('session.header.unknown'))}
        {sessionPath && (
          <button
            onClick={handleCopyPath}
            className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
            title={t('session.copyPath', 'Copy JSONL path')}
          >
            <Copy className="h-3 w-3" />
          </button>
        )}
      </h1>
      <div className="session-meta">
        <div className="info-item">
          <span className="info-label">{t('session.header.date')}:</span>
          <span className="info-value">{timestamp ? formatDate(timestamp) : t('session.header.unknown')}</span>
        </div>
        <div className="info-item">
          <span className="info-label">{t('session.header.models')}:</span>
          <span className="info-value">{stats.models.join(', ') || t('session.header.unknown')}</span>
        </div>
        <div className="info-item">
          <span className="info-label">{t('session.header.messagesLabel')}:</span>
          <span className="info-value">{msgParts.join(', ') || '0'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">{t('session.header.toolCalls')}:</span>
          <span className="info-value">{stats.toolCalls}</span>
        </div>
        <div className="info-item">
          <span className="info-label">{t('session.header.tokens')}:</span>
          <span className="info-value">{tokenParts.join(' ') || '0'}</span>
        </div>
        <div className="info-item">
          <span className="info-label">{t('session.header.cost')}:</span>
          <span className="info-value">${totalCost.toFixed(3)}</span>
        </div>
      </div>
    </div>
  )
}

export default memo(SessionHeader)
