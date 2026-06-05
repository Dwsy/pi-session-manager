import type { Content } from '@/types'
import { useTranslation } from 'react-i18next'
import MarkdownContent from '@/components/ui/MarkdownContent'
import { formatDate } from '@/utils/format'
import { Copy, Check, Maximize2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { memo, useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { useClipboard } from '@/hooks/useClipboard'

interface UserMessageProps {
  id: string
  timestamp?: string
  content: Content[]
  className?: string
  searchQuery?: string
}

const HEIGHT_THRESHOLD = 200

function UserMessage({ id, timestamp, content, className = '', searchQuery = '' }: UserMessageProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [shouldShowExpand, setShouldShowExpand] = useState(false)
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

  // Measure content height to decide whether to show expand button
  useEffect(() => {
    if (!contentRef.current) return

    const measureHeight = () => {
      if (contentRef.current) {
        const height = contentRef.current.scrollHeight
        setShouldShowExpand(height > HEIGHT_THRESHOLD)
      }
    }

    measureHeight()

    const observer = new ResizeObserver(() => {
      measureHeight()
    })

    observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [text])

  const handleCopy = useCallback(async () => {
    try {
      await copyText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy message text:', err)
    }
  }, [copyText, text])

  return (
    <div className={`user-message ${className}`} id={`entry-${id}`}>
      <div className="user-message-header">
        <div className="user-message-meta">
          <span className="user-message-role">{t('components.userMessage.you')}</span>
          {timestamp && <span className="message-timestamp">{formatDate(timestamp)}</span>}
        </div>
        <div className="flex items-center gap-1">
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
              aria-label={
                copied
                  ? t('components.userMessage.copied') || 'Copied'
                  : t('components.userMessage.copyText') || 'Copy text'
              }
              title={copied ? t('components.userMessage.copied') || 'Copied!' : t('components.userMessage.copyText') || 'Copy text'}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          )}
          {shouldShowExpand && (
            <ExpandButton
              text={text}
              images={images}
              timestamp={timestamp}
              searchQuery={searchQuery}
            />
          )}
        </div>
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
        <div ref={contentRef} className="user-message-body-truncated">
          <MarkdownContent content={text} className="user-message-body" searchQuery={searchQuery} />
        </div>
      )}
    </div>
  )
}

// Expand button opens the modal - separated to isolate hooks
function ExpandButton({ text, images, timestamp, searchQuery }: {
  text: string
  images: { type: string; data?: string; mimeType?: string }[]
  timestamp?: string
  searchQuery?: string
}) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  const handleOpen = useCallback(() => setIsOpen(true), [])
  const handleClose = useCallback(() => setIsOpen(false), [])

  return (
    <>
      <button
        onClick={handleOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleOpen()
          }
        }}
        className="tool-copy-button user-message-copy-button"
        aria-label={t('components.userMessage.expand') || 'Expand message'}
        title={t('components.userMessage.expand') || 'Expand message'}
      >
        <Maximize2 className="w-4 h-4" />
      </button>

      {isOpen && (
        <UserMessageModal
          text={text}
          images={images}
          timestamp={timestamp}
          searchQuery={searchQuery}
          onClose={handleClose}
        />
      )}
    </>
  )
}

// Modal component - isolated to prevent hook order issues
// Rendered via portal at document.body so ancestors with `backdrop-filter` /
// `transform` / `contain: paint` don't trap the fixed-positioned overlay.
function UserMessageModal({ text, images, timestamp, searchQuery, onClose }: {
  text: string
  images: { type: string; data?: string; mimeType?: string }[]
  timestamp?: string
  searchQuery?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Global ESC handler — focus may not always be inside the dialog.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Lock body scroll while modal is open and restore on close.
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

  // Auto-focus close button for keyboard users.
  useEffect(() => {
    closeButtonRef.current?.focus()
  }, [])

  const modal = (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md motion-overlay-enter"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-message-modal-title"
    >
      <div className="flex h-[80vh] w-[80vw] max-w-5xl flex-col overflow-hidden rounded-xl border border-border/70 bg-surface-dark/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl motion-overlay-surface-enter">
        <div className="flex items-start justify-between gap-4 border-b border-border/60 bg-surface-dark/55 px-6 py-4">
          <div className="min-w-0">
            <h3 id="user-message-modal-title" className="truncate text-base font-semibold text-foreground">
              {t('components.userMessage.fullMessage') || 'Full Message'}
            </h3>
            {timestamp && (
              <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(timestamp)}</p>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            title={t('components.userMessage.close') || 'Close'}
            aria-label={t('components.userMessage.close') || 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {images.length > 0 && (
            <div className="message-images mb-4 flex flex-wrap gap-3">
              {images.map((img, idx) => (
                <img
                  key={idx}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  className="message-image max-h-72 rounded-lg border border-border/60"
                  alt={t('components.userMessage.imageAlt')}
                />
              ))}
            </div>
          )}
          <MarkdownContent content={text} className="user-message-body" searchQuery={searchQuery} />
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}

export default memo(UserMessage)