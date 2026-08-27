import type { Content } from '@/types'
import { useTranslation } from 'react-i18next'
import MarkdownContent from '@/components/ui/MarkdownContent'
import { SkillAwareMessage } from './SkillInvocationBlock'
import { formatDate } from '@/utils/format'
import { Copy, Check, Maximize2, X, FileText, Eye, ChevronDown, ChevronUp } from 'lucide-react'
import { createPortal } from 'react-dom'
import {
  memo,
  useMemo,
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react'
import { useClipboard } from '@/hooks/useClipboard'

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
  const [showRaw, setShowRaw] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
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

  const handleCopy = useCallback(async () => {
    try {
      await copyText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy message text:', err)
    }
  }, [copyText, text])

  const hasDisplayContent = text.trim().length > 0 || images.length > 0
  const expandButtonRef = useRef<HTMLButtonElement>(null)

  const handleOpenModal = useCallback(() => setIsModalOpen(true), [])
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
    requestAnimationFrame(() => expandButtonRef.current?.focus())
  }, [])

  const bodyRef = useRef<HTMLDivElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  useEffect(() => {
    const element = bodyRef.current
    if (!element) return

    const observer = new ResizeObserver(() => {
      setIsTruncated(element.scrollHeight > element.clientHeight)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [text])

  const roleLabel = t('components.userMessage.you', 'You')

  return (
    <>
      <article
        className={`user-message ${className}`}
        id={`entry-${id}`}
        aria-label={roleLabel}
      >
        <div className="user-message-header">
          <div className="user-message-meta">
            <span className="user-message-role">{roleLabel}</span>
            {timestamp && (
              <span className="user-message-timestamp">{formatDate(timestamp)}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {text.trim() && (
              <>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    setShowRaw(!showRaw)
                  }}
                  className={`tool-copy-button user-message-copy-button ${showRaw ? 'active' : ''}`}
                  aria-pressed={showRaw}
                  aria-label={
                    showRaw
                      ? t('components.userMessage.viewRendered') || 'View Rendered'
                      : t('components.userMessage.viewRaw') || 'View Raw'
                  }
                  title={
                    showRaw
                      ? t('components.userMessage.viewRendered') || 'View Rendered'
                      : t('components.userMessage.viewRaw') || 'View Raw'
                  }
                >
                  {showRaw ? <Eye className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    void handleCopy()
                  }}
                  className="tool-copy-button user-message-copy-button"
                  aria-label={
                    copied
                      ? t('components.userMessage.copied') || 'Copied'
                      : t('components.userMessage.copyText') || 'Copy text'
                  }
                  title={copied ? t('components.userMessage.copied') || 'Copied!' : t('components.userMessage.copyText') || 'Copy text'}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </>
            )}
            {hasDisplayContent && (
              <button
                ref={expandButtonRef}
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  handleOpenModal()
                }}
                className="tool-copy-button user-message-copy-button"
                aria-haspopup="dialog"
                aria-label={t('components.userMessage.expand') || 'Expand message'}
                title={t('components.userMessage.expand') || 'Expand message'}
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="user-message-content">
          {images.length > 0 && (
            <div className="message-images">
              {images.map((img, idx) => (
                <img
                  key={idx}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  className="message-image"
                  alt={`${t('components.userMessage.imageAlt')} ${idx + 1}`}
                  loading="lazy"
                />
              ))}
            </div>
          )}

          {!hasDisplayContent && (
            <p className="user-message-empty">
              {t('components.userMessage.empty', 'Empty message')}
            </p>
          )}

          {text.trim() && (
            <div
              ref={bodyRef}
              className={`user-message-body-truncated ${isTruncated ? 'is-truncated' : ''} ${isExpanded ? 'is-expanded' : ''}`}
            >
              {showRaw ? (
                <pre className="user-message-body-raw">{text}</pre>
              ) : (
                <SkillAwareMessage text={text} searchQuery={searchQuery} />
              )}
            </div>
          )}

          {(isTruncated || isExpanded) && (
            <button
              type="button"
              className="user-message-expand-toggle"
              onClick={() => setIsExpanded(prev => !prev)}
              aria-expanded={isExpanded}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  {t('components.userMessage.showLess', 'Show less')}
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  {t('components.userMessage.showMore', 'Show more')}
                </>
              )}
            </button>
          )}
        </div>
      </article>

      {isModalOpen && (
        <UserMessageModal
          text={text}
          images={images}
          timestamp={timestamp}
          searchQuery={searchQuery}
          initialShowRaw={showRaw}
          onClose={handleCloseModal}
        />
      )}
    </>
  )
}

// Modal component - rendered via portal to avoid stacking context issues
function UserMessageModal({ text, images, timestamp, searchQuery, initialShowRaw = false, onClose }: {
  text: string
  images: { type: string; data?: string; mimeType?: string }[]
  timestamp?: string
  searchQuery?: string
  initialShowRaw?: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(initialShowRaw)
  const { copyText } = useClipboard()

  const handleCopy = useCallback(async () => {
    try {
      await copyText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy message text:', err)
    }
  }, [copyText, text])

  // Capture-phase ESC: close modal only, do not bubble to SessionViewer / search hotkeys
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [onClose])

  // Lock body scroll while modal is open
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousPaddingRight = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
    }
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.paddingRight = previousPaddingRight
    }
  }, [])

  // Auto-focus close button
  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  const modal = (
    <div
      className="user-message-modal-overlay motion-overlay-enter"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-message-modal-title"
    >
      <div
        className="user-message-modal-container motion-overlay-surface-enter"
        onKeyDown={e => e.stopPropagation()}
      >
        <div className="user-message-modal-header">
          <div className="user-message-modal-title-area">
            <h3 id="user-message-modal-title" className="user-message-modal-title">
              {t('components.userMessage.fullMessage') || 'Full Message'}
            </h3>
            {timestamp && (
              <p className="user-message-modal-subtitle">{formatDate(timestamp)}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {text.trim() && (
              <>
                <button
                  type="button"
                  onClick={() => setShowRaw(!showRaw)}
                  className={`user-message-modal-close-btn ${showRaw ? 'active' : ''}`}
                  aria-pressed={showRaw}
                  aria-label={
                    showRaw
                      ? t('components.userMessage.viewRendered') || 'View Rendered'
                      : t('components.userMessage.viewRaw') || 'View Raw'
                  }
                  title={
                    showRaw
                      ? t('components.userMessage.viewRendered') || 'View Rendered'
                      : t('components.userMessage.viewRaw') || 'View Raw'
                  }
                >
                  {showRaw ? <Eye className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="user-message-modal-close-btn"
                  aria-label={
                    copied
                      ? t('components.userMessage.copied') || 'Copied'
                      : t('components.userMessage.copyText') || 'Copy text'
                  }
                  title={copied ? t('components.userMessage.copied') || 'Copied!' : t('components.userMessage.copyText') || 'Copy text'}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </>
            )}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="user-message-modal-close-btn"
              title={t('components.userMessage.close') || 'Close'}
              aria-label={t('components.userMessage.close') || 'Close'}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="user-message-modal-body">
          {images.length > 0 && (
            <div className="message-images mb-4 flex flex-wrap gap-3">
              {images.map((img, idx) => (
                <img
                  key={idx}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  className="message-image max-h-72 rounded-lg border border-border/60"
                  alt={`${t('components.userMessage.imageAlt')} ${idx + 1}`}
                  loading="lazy"
                />
              ))}
            </div>
          )}
          {showRaw ? (
            <pre className="user-message-body-raw">{text}</pre>
          ) : (
            <MarkdownContent content={text} className="user-message-body" searchQuery={searchQuery} />
          )}
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}

export default memo(UserMessage)