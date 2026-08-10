import { memo, useState } from 'react'
import type { TFunction } from 'i18next'
import type { SessionInfo, LegacySessionStats } from '@/types'
import { formatDate, formatTokens, shortenPath } from '@/utils/format'
import { formatShortTime } from '@/utils/sessionDisplay'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Radio } from 'lucide-react'
import { useClipboard } from '@/hooks/useClipboard'

interface SessionHeaderProps {
  session: SessionInfo
  timestamp?: string
  stats: LegacySessionStats
  previewMode?: boolean
  isLive?: boolean
}

function formatHeaderTime(value: string, t: TFunction): string {
  const timestamp = new Date(value).getTime()
  const age = Date.now() - timestamp

  if (Number.isFinite(timestamp) && age >= 0 && age < 24 * 60 * 60 * 1000) {
    return formatShortTime(value, t)
  }

  return formatDate(value)
}

function SessionHeader({ session, timestamp, stats, previewMode = false, isLive = false }: SessionHeaderProps) {
  const { t } = useTranslation()
  const { copyText } = useClipboard()
  const [copiedTarget, setCopiedTarget] = useState<'path' | null>(null)
  const modelSummary = stats.models.join(', ') || session.models?.join(', ') || session.model || t('session.header.unknown')
  const displayPath = shortenPath(session.cwd || session.path, previewMode ? 54 : 72)
  const displayId = session.id || t('session.header.unknown')
  const detailParts = [
    stats.userMessages && `${stats.userMessages} ${t('session.header.user')}`,
    stats.assistantMessages && `${stats.assistantMessages} ${t('session.header.assistant')}`,
    stats.toolResults && `${stats.toolResults} ${t('session.header.toolResults')}`,
    stats.compactions && `${stats.compactions} ${t('session.header.compactions')}`,
  ].filter(Boolean)
  const tokenParts = [
    stats.tokens.input && `↑${formatTokens(stats.tokens.input)}`,
    stats.tokens.output && `↓${formatTokens(stats.tokens.output)}`,
    stats.tokens.cacheRead && `R${formatTokens(stats.tokens.cacheRead)}`,
    stats.tokens.cacheWrite && `W${formatTokens(stats.tokens.cacheWrite)}`,
  ].filter(Boolean)

  const copyValue = async (value: string) => {
    await copyText(value)
    setCopiedTarget('path')
    window.setTimeout(() => setCopiedTarget(null), 1500)
  }

  return (
    <section className={`session-header session-header--telemetry${previewMode ? ' session-header--preview' : ''}`} aria-label={t('session.header.context', 'Session context')}>
      <div className="session-header__topline">
        <div className="session-header__context">
          <div className="session-header__path-row">
            {session.name && !previewMode && (
              <>
                <span className="session-header__name" title={session.name}>{session.name}</span>
                <span className="session-header__separator" aria-hidden="true">›</span>
              </>
            )}
            <span className="session-header__path" title={session.cwd || session.path}>{displayPath}</span>
            <button
              type="button"
              className="session-header__copy-button"
              onClick={() => void copyValue(session.path)}
              title={t('session.copyPath', 'Copy JSONL path')}
              aria-label={t('session.copyPath', 'Copy JSONL path')}
            >
              {copiedTarget === 'path' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            </button>
          </div>
          <div className="session-header__meta-row">
            {isLive && (
              <span className="session-header__live" title={t('session.streaming', 'Streaming')}>
                <Radio className="session-header__live-icon" aria-hidden="true" />
                {t('session.streaming', 'Streaming')}
              </span>
            )}
            {timestamp && <><span>{t('common.created')} {formatHeaderTime(timestamp, t)}</span><span className="session-header__separator" aria-hidden="true">·</span></>}
            {session.modified && <><span>{t('common.updated')} {formatHeaderTime(session.modified, t)}</span><span className="session-header__separator" aria-hidden="true">·</span></>}
            <span className="session-header__model" title={modelSummary}>{modelSummary}</span>
          </div>
        </div>
        <div className="session-header__id-wrap">
          <span className="session-header__id" title={displayId}>{displayId}</span>
          <button
            type="button"
            className="session-header__copy-button"
            onClick={() => void copyValue(session.path)}
            title={t('session.copyPath', 'Copy JSONL path')}
            aria-label={t('session.copyPath', 'Copy JSONL path')}
          >
            {copiedTarget === 'path' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </button>
        </div>
      </div>

      {!previewMode && (
        <div className="session-header__detail-row">
          <span>{detailParts.join(' · ') || `0 ${t('session.header.messagesLabel')}`}</span>
          <span>{tokenParts.join(' ') || '0'}</span>
        </div>
      )}
    </section>
  )
}

export default memo(SessionHeader)
