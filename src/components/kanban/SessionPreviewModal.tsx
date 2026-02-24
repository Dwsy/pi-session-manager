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
  onExport: () => void
  onRename: () => void
  terminal?: TerminalType
  piPath?: string
  customCommand?: string
  initialCardRect?: DOMRect | null
}

export default function SessionPreviewModal({
  session,
  isOpen,
  onClose,
  onExpand,
  onExport,
  onRename,
  terminal,
  piPath,
  customCommand,
  initialCardRect,
}: SessionPreviewModalProps) {
  const { t } = useTranslation()
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationStyles, setAnimationStyles] = useState<React.CSSProperties>({})
  const modalRef = useRef<HTMLDivElement>(null)
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'

      // Start FLIP animation if we have initial card rect
      if (initialCardRect) {
        setIsAnimating(true)

        // Calculate initial transform to match card position
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const modalWidth = viewportWidth * 0.9
        const modalHeight = viewportHeight * 0.9
        const modalCenterX = (viewportWidth - modalWidth) / 2
        const modalCenterY = (viewportHeight - modalHeight) / 2

        // Calculate the initial position (card position) to final position (modal center)
        const initialX = initialCardRect.left - modalCenterX
        const initialY = initialCardRect.top - modalCenterY
        const initialScaleX = initialCardRect.width / modalWidth
        const initialScaleY = initialCardRect.height / modalHeight

        // Apply initial styles (starting state)
        setAnimationStyles({
          transform: `translate(${initialX}px, ${initialY}px) scale(${initialScaleX}, ${initialScaleY})`,
          opacity: 0,
          transition: 'none',
        })

        // Force a reflow to ensure the browser applies the initial styles
        requestAnimationFrame(() => {
          // Apply final styles (ending state) with animation
          setAnimationStyles({
            transform: 'translate(0, 0) scale(1)',
            opacity: 1,
            transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          })

          // Clear animation state after animation completes
          animationTimeoutRef.current = setTimeout(() => {
            setIsAnimating(false)
            setAnimationStyles({})
          }, 300)
        })
      }
    } else {
      // Clear animation styles when closed
      setAnimationStyles({})
      setIsAnimating(false)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current)
      }
    }
  }, [isOpen, handleKeyDown, initialCardRect])

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
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
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
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
      {/* Modal Container - 90vw × 90vh, centered */}
      <div
        ref={modalRef}
        className="bg-surface rounded-lg shadow-2xl flex flex-col overflow-hidden border border-border"
        style={{
          width: '90vw',
          height: '90vh',
          ...animationStyles,
        }}
      >
        {/* Header with session name and Expand button */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-dark">
          <h2
            id="session-preview-title"
            className="text-lg font-semibold text-foreground truncate pr-4"
            title={session.name || t('kanban.untitledSession', 'Untitled Session')}
          >
            {session.name || t('kanban.untitledSession', 'Untitled Session')}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExpand}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground bg-surface hover:bg-surface-light rounded-md transition-colors cursor-pointer"
              aria-label={t('kanban.expand', 'Expand to full view')}
            >
              <Maximize2 className="w-4 h-4" />
              <span>{t('kanban.expand', 'Expand')}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-surface-light rounded-md transition-colors cursor-pointer"
              aria-label={t('common.close', 'Close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content area with SessionViewer */}
        <div className="flex-1 overflow-hidden bg-background h-[calc(90vh-4rem)]">
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
