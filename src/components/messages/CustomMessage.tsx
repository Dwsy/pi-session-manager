import { formatDate } from '@/utils/format'
import { useTranslation } from 'react-i18next'
import MarkdownContent from '@/components/ui/MarkdownContent'
import SubagentCustomMessage from './SubagentCustomMessage'
import { resolveCustomMessageRendererKind } from './customMessageAdapters'

interface CustomMessageProps {
  customType?: string
  content?: any
  details?: unknown
  timestamp?: string
}

export default function CustomMessage({ customType, content, details, timestamp }: CustomMessageProps) {
  const { t } = useTranslation()

  if (resolveCustomMessageRendererKind(customType) === 'subagent') {
    return (
      <SubagentCustomMessage
        customType={customType}
        content={content}
        details={details}
        timestamp={timestamp}
      />
    )
  }

  const contentText = typeof content === 'string' ? content : JSON.stringify(content)

  return (
    <div className="hook-message">
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
      <div className="hook-type">[{customType ? escapeHtml(customType) : t('components.customMessage.custom')}]</div>
      <div className="markdown-content">
        <MarkdownContent content={contentText} />
      </div>
    </div>
  )
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}