import type { Content } from '../types'
import { useTranslation } from 'react-i18next'
import { parseMarkdown } from '../utils/markdown'
import { highlightSearchInHTML } from '../utils/search'
import { formatDate } from '../utils/format'
import { Copy, Check } from 'lucide-react'
import { memo, useMemo, useState } from 'react'

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
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy message text:', err)
    }
  }

  return (
    <div className={`user-message ${className}`} id={`entry-${id}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
        {timestamp && <span className="message-timestamp user-timestamp-inline">{formatDate(timestamp)}</span>}
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
          <div className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
          <div className="flex justify-end mt-2">
            <button
              onClick={handleCopy}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCopy();
                }
              }}
              className="tool-copy-button"
              aria-label={copied ? (t('components.userMessage.copied') || 'Copied') : (t('components.userMessage.copyText') || 'Copy text')}
              title={copied ? t('components.userMessage.copied') || 'Copied!' : t('components.userMessage.copyText') || 'Copy text'}
            >
              {copied ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default memo(UserMessage)
