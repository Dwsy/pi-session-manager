import { useEffect, useCallback, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Maximize2 } from 'lucide-react'
import type { SessionInfo } from '../../types'
import type { TerminalType } from '../settings/types'
import SessionViewer from '../SessionViewer'

export interface SessionPreviewModalProps {
  session: SessionInfo | null
  isOpen: boolean
  onClose: () => void
  onExpand: () => void
  onExport?: () => void
  onRename?: () => void
  terminal?: TerminalType
  piPath?: string
  customCommand?: string
  initialCardRect?: DOMRect | null
  onCloseAnimationComplete?: () => void
}

export default function SessionPreviewModal({
  session,
  isOpen,
  onClose,
  onExpand,
  onExport = () => {},
  onRename = () => {},
  terminal,
  piPath,
  customCommand,
  initialCardRect,
  onCloseAnimationComplete,
}: SessionPreviewModalProps) {
  const { t } = useTranslation()
  const [isAnimating, setIsAnimating] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [animationStyles, setAnimationStyles] = useState<React.CSSProperties>({})
  const modalRef = useRef<HTMLDivElement>(null)
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleCloseWithAnimation = useCallback(() => {
    if (isClosing || !session) {
      onClose()
      return
    }

    setIsClosing(true)

    const cardEl = document.querySelector(`[data-session-id="${session.id}"]`)
    const currentCardRect = cardEl ? cardEl.getBoundingClientRect() : null

    const isCardVisible = currentCardRect && (
      currentCardRect.top >= 0 &&
      currentCardRect.left >= 0 &&
      currentCardRect.bottom <= window.innerHeight &&
      currentCardRect.right <= window.innerWidth
    )

    if (isCardVisible && currentCardRect) {
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const modalWidth = viewportWidth * 0.9
      const modalHeight = viewportHeight * 0.9
      const modalCenterX = (viewportWidth - modalWidth) / 2
      const modalCenterY = (viewportHeight - modalHeight) / 2

      const targetX = currentCardRect.left - modalCenterX
      const targetY = currentCardRect.top - modalCenterY
      const targetScaleX = currentCardRect.width / modalWidth
      const targetScaleY = currentCardRect.height / modalHeight

      setAnimationStyles({
        transform: `translate(${targetX}px, ${targetY}px) scale(${targetScaleX}, ${targetScaleY})`,
        opacity: 0,
        transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      })
    } else {
      setAnimationStyles({
        transform: 'translate(0, 0) scale(0.95)',
        opacity: 0,
        transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      })
    }

    animationTimeoutRef.current = setTimeout(() => {
      setIsClosing(false)
      setAnimationStyles({})
      onClose()
      onCloseAnimationComplete?.()
    }, 300)
  }, [isClosing, session, onClose, onCloseAnimationComplete])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseWithAnimation()
        return
      }

      if (event.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault()
          lastElement?.focus()
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault()
          firstElement?.focus()
        }
      }
    },
    [handleCloseWithAnimation]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'

      focusTimeoutRef.current = setTimeout(() => {
        if (modalRef.current) {
          const focusable = modalRef.current.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
          focusable?.focus()
        }
      }, 50)

      if (initialCardRect) {
        setIsAnimating(true)

        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const modalWidth = viewportWidth * 0.9
        const modalHeight = viewportHeight * 0.9
        const modalCenterX = (viewportWidth - modalWidth) / 2
        const modalCenterY = (viewportHeight - modalHeight) / 2

        const initialX = initialCardRect.left - modalCenterX
        const initialY = initialCardRect.top - modalCenterY
        const initialScaleX = initialCardRect.width / modalWidth
        const initialScaleY = initialCardRect.height / modalHeight

        setAnimationStyles({
          transform: `translate(${initialX}px, ${initialY}px) scale(${initialScaleX}, ${initialScaleY})`,
          opacity: 0,
          transition: 'none',
        })

        requestAnimationFrame(() => {
          setAnimationStyles({
            transform: 'translate(0, 0) scale(1)',
            opacity: 1,
            transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          })

          animationTimeoutRef.current = setTimeout(() => {
            setIsAnimating(false)
            setAnimationStyles({})
          }, 300)
        })
      }
    } else {
      setAnimationStyles({})
      setIsAnimating(false)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current)
      }
    }
  }, [isOpen, handleKeyDown, initialCardRect])

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      handleCloseWithAnimation()
    }
  }

  const handleExpand = () => {
    onExpand()
  }

  if (!isOpen || !session) {
    return null
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-0"
      style={{
        opacity: isAnimating ? 0 : 1,
        animation: isAnimating ? 'fadeIn 300ms cubic-bezier(0.4, 0, 0.2, 1) forwards' : undefined,
      }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-preview-title"
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div
        ref={modalRef}
        className="bg-surface rounded-lg shadow-2xl flex flex-col overflow-hidden border border-border w-full h-full sm:w-[90vw] sm:h-[90vh] sm:max-w-[90vw] sm:max-h-[90vh]"
        style={{
          ...animationStyles,
        }}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-surface-dark flex-shrink-0">
          <h2
            id="session-preview-title"
            className="text-base sm:text-lg font-semibold text-foreground truncate pr-4"
            title={session.name || t('kanban.untitledSession', 'Untitled Session')}
          >
            {session.name || t('kanban.untitledSession', 'Untitled Session')}
          </h2>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={handleExpand}
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-foreground bg-surface hover:bg-surface-light rounded-md transition-colors cursor-pointer"
              aria-label={t('kanban.expand', 'Expand to full view')}
            >
              <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">{t('kanban.expand', 'Expand')}</span>
            </button>
            <button
              onClick={handleCloseWithAnimation}
              className="p-1.5 sm:p-2 text-muted-foreground hover:text-foreground hover:bg-surface-light rounded-md transition-colors cursor-pointer"
              aria-label={t('common.close', 'Close')}
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-background">
          <SessionViewer
            session={session}
            onExport={onExport}
            onRename={onRename}
            onBack={onClose}
            terminal={terminal}
            piPath={piPath}
            customCommand={customCommand}
          />
        </div>
      </div>
    </div>
  )
}
