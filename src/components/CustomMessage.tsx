import { formatDate } from '../utils/format'
import MarkdownContent from './MarkdownContent'

interface CustomMessageProps {
  customType?: string
  content?: any
  timestamp?: string
}

export default function CustomMessage({ customType, content, timestamp }: CustomMessageProps) {
  const contentText = typeof content === 'string' ? content : JSON.stringify(content)

  return (
    <div className="hook-message">
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
      <div className="hook-type">[{customType ? escapeHtml(customType) : 'custom'}]</div>
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