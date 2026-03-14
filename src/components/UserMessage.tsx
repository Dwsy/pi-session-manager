import type { Content } from '../types'
import { useTranslation } from 'react-i18next'
import { parseMarkdown } from '../utils/markdown'
import { highlightSearchInHTML } from '../utils/search'
import { formatDate } from '../utils/format'
import { Copy, Check } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { useClipboard } from '../hooks/useClipboard'

interface UserMessageProps {
  id: string
  timestamp?: string
  content: Content[]
  className?: string
  searchQuery?: string
}

function UserMessage({ id, timestamp, content, className = '', searchQuery = '' }: UserMessageProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const { copyText } = useClipboard()

  const images = useMemo(
    () => content.filter(c => c.type === 'image' && c.data),
    [content],
  )

  const textItems = useMemo(
    () => content.filter(c => c.type === 'text' && c.text),
    [content],
  )

  const text = useMemo(
    () => textItems.map(c => c.text).join('\n'),
    [textItems],
  )

  const html = useMemo(() => {
    let parsed = parseMarkdown(text)
    if (searchQuery) {
      parsed = highlightSearchInHTML(parsed, searchQuery)
    }
    return parsed
  }, [text, searchQuery])

  const handleCopy = async () => {
    try {
      await copyText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy message text:', err)
    }
  }

  return (
    <div className={`user-message ${className}`} id={`entry-${id}`}>
      <div className="user-message-header">
        <div className="user-message-meta">
          <span className="user-message-role">{t('components.userMessage.you')}</span>
          {timestamp && <span className="message-timestamp">{formatDate(timestamp)}</span>}
        </div>
        {text.trim() && (
          <button
            onClick={() => {
              void handleCopy()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                void handleCopy()
              }
            }}
            className="tool-copy-button user-message-copy-button"
            aria-label={copied ? (t('components.userMessage.copied') || 'Copied') : (t('components.userMessage.copyText') || 'Copy text')}
            title={copied ? t('components.userMessage.copied') || 'Copied!' : t('components.userMessage.copyText') || 'Copy text'}
          >
            {copied ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

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
        <>
          <div className="markdown-content user-message-body" dangerouslySetInnerHTML={{ __html: html }} />
        </>
      )}
    </div>
  )
}

export default memo(UserMessage)
