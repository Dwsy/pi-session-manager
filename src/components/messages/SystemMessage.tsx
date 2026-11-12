import { ChevronRight, MessageSquareText, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/utils/format'
import type { Message } from '@/types'
import { useSystemMessageContext } from './SystemMessageContext'

interface Props {
  entryId: string
  message: Message
  timestamp?: string
}

const EXCERPT_LIMIT = 140

function messagePrompt(message: Message): string {
  const content = Array.isArray(message.content)
    ? message.content
        .filter((item) => item.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text)
        .join('\n')
    : typeof message.content === 'string' ? message.content : ''
  const sections = Object.values(message.sections ?? {}).filter(
    (text): text is string => typeof text === 'string' && text.length > 0,
  )
  return [content, ...sections].filter(Boolean).join('\n\n')
}

function messageToolNames(message: Message): { added: string[]; removed: string[] } {
  const added = (message.toolsAdded ?? [])
    .map((tool) => (typeof tool === 'string' ? tool : tool?.name))
    .filter((name): name is string => Boolean(name))
  const removed = (message.toolsRemoved ?? [])
    .map((tool) => (typeof tool === 'string' ? tool : tool?.name))
    .filter((name): name is string => Boolean(name))
  return { added, removed }
}

export default function SystemMessage({ entryId, message, timestamp }: Props) {
  const { t } = useTranslation()
  const context = useSystemMessageContext()
  const snapshot = context?.snapshots.get(entryId)

  const sectionCount = snapshot?.sections.length ?? Object.keys(message.sections ?? {}).length
  const prompt = snapshot?.prompt ?? messagePrompt(message)
  const excerpt = prompt.replace(/\s+/g, ' ').trim()
  const fallbackTools = messageToolNames(message)
  const added = snapshot?.toolsAdded ?? fallbackTools.added
  const removed = snapshot?.toolsRemoved ?? fallbackTools.removed
  const activeTools = snapshot?.tools.map((tool) => tool.name) ?? []
  const changes = [
    ...added.map((name) => `+${name}`),
    ...removed.map((name) => `−${name}`),
  ]
  const toolDetail = changes.length > 0 ? changes : activeTools
  const toolCount = `+${added.length} / −${removed.length}`

  return (
    <div className="message-system">
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
      <div className="system-message-card">
        <div className="system-message-label">[system]</div>
        <button
          type="button"
          className="system-message-row"
          disabled={!context}
          onClick={() => context?.open(entryId, 'prompt')}
        >
          <MessageSquareText className="system-message-icon" size={14} aria-hidden="true" />
          <span className="system-message-main">
            <span className="system-message-title">
              {t('session.systemMessage.prompt', 'System prompt')}
              <span className="system-message-meta">
                {' '}· {t('session.systemMessage.sections', '{{count}} sections', { count: sectionCount })}
              </span>
            </span>
            {excerpt && (
              <span className="system-message-detail">
                {excerpt.length > EXCERPT_LIMIT ? `${excerpt.slice(0, EXCERPT_LIMIT)}…` : excerpt}
              </span>
            )}
          </span>
          <ChevronRight className="system-message-chevron" size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="system-message-row"
          disabled={!context}
          onClick={() => context?.open(entryId, 'tools')}
        >
          <Wrench className="system-message-icon" size={14} aria-hidden="true" />
          <span className="system-message-main">
            <span className="system-message-title">
              {t('session.systemMessage.tools', 'Tools')}
              <span className="system-message-meta"> · {toolCount}</span>
            </span>
            {toolDetail.length > 0 && (
              <span className="system-message-detail system-message-tools">
                {toolDetail.join(', ')}
              </span>
            )}
            {toolDetail.length === 0 && (
              <span className="system-message-detail">
                {t('session.systemMessage.noTools', 'No tool changes')}
              </span>
            )}
          </span>
          <ChevronRight className="system-message-chevron" size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
