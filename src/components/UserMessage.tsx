import type { Content } from '../types'
import { useTranslation } from 'react-i18next'
import { parseMarkdown } from '../utils/markdown'
import { highlightSearchInHTML } from '../utils/search'
import { formatDate } from '../utils/format'

interface UserMessageProps {
  id: string
  timestamp?: string
  content: Content[]
  className?: string
  searchQuery?: string
}

export default function UserMessage({ id, timestamp, content, className = '', searchQuery = '' }: UserMessageProps) {
  const { t } = useTranslation()
  // Extract images
  const images = content.filter(c => c.type === 'image' && c.data)

  // Extract text content
  const textItems = content.filter(c => c.type === 'text' && c.text)
  const text = textItems.map(c => c.text).join('\n')

  // 解析 Markdown 并高亮搜索结果
  let html = parseMarkdown(text)
  if (searchQuery) {
    html = highlightSearchInHTML(html, searchQuery)
  }

  return (
    <div className={`user-message ${className}`} id={`entry-${id}`}>
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}

      {images.length > 0 && (
        <div className="message-images">
          {images.map((img, idx) => (
            <img
              key={idx}
              src={`data:${img.mimeType};base64,${img.data}`}
              className="message-image"
              alt={t('components.userMessage.imageAlt')}
            />
          ))}
        </div>
      )}

      {text.trim() && (
        <div className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  )
}