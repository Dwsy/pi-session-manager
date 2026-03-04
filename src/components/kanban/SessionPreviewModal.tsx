import { useLayoutEffect, useCallback, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Maximize2 } from 'lucide-react'
import type { SessionInfo } from '../../types'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import type { TerminalType } from '../settings/types'
import SessionViewer from '../SessionViewer'

export type SessionPreviewAnimationMode = 'stable' | 'origin-point'

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
  initialClickPoint?: { x: number; y: number } | null
  animationMode?: SessionPreviewAnimationMode
  onCloseAnimationComplete?: () => void
}

const MODAL_OPEN_ANIMATION_DURATION_MS = 180
const MODAL_CLOSE_ANIMATION_DURATION_MS = 140

function resolveAnimationMode(
  explicitMode: SessionPreviewAnimationMode,
  prefersReducedMotion: boolean,
): SessionPreviewAnimationMode {
  if (prefersReducedMotion) {
    return 'stable'
  }

  return explicitMode
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
  initialClickPoint,
  animationMode = 'stable',
  onCloseAnimationComplete,
}: SessionPreviewModalProps) {
  const { t } = useTranslation()
  const prefersReducedMotion = usePrefersReducedMotion()
  const [, setIsAnimating] = useState(false)
  const [animationStyles, setAnimationStyles] = useState<React.CSSProperties>({})
  const modalRef = useRef<HTMLDivElement>(null)
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const closeInFlightRef = useRef(false)
  const resolvedAnimationMode = resolveAnimationMode(animationMode, prefersReducedMotion)
  const openAnimationDuration = prefersReducedMotion ? 1 : MODAL_OPEN_ANIMATION_DURATION_MS
  const closeAnimationDuration = prefersReducedMotion ? 1 : MODAL_CLOSE_ANIMATION_DURATION_MS
  const openAnimationTransition = `transform ${openAnimationDuration}ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${openAnimationDuration}ms cubic-bezier(0.16, 1, 0.3, 1)`
  const closeAnimationTransition = `transform ${closeAnimationDuration}ms cubic-bezier(0.4, 0, 1, 1), opacity ${closeAnimationDuration}ms cubic-bezier(0.4, 0, 1, 1)`

  const getTransformOrigin = useCallback(() => {
    if (resolvedAnimationMode !== 'origin-point' || !initialClickPoint) {
      return 'center center'
    }

    const rect = modalRef.current?.getBoundingClientRect()
    if (!rect) {
      return 'center center'
    }

    const x = Math.min(Math.max(initialClickPoint.x - rect.left, 0), rect.width)
    const y = Math.min(Math.max(initialClickPoint.y - rect.top, 0), rect.height)
    return `${x}px ${y}px`
  }, [initialClickPoint, resolvedAnimationMode])

  const handleCloseWithAnimation = useCallback(() => {
    if (closeInFlightRef.current) {
      return
    }

    if (!session) {
      onClose()
      return
    }

    closeInFlightRef.current = true

    if (prefersReducedMotion) {
      onClose()
      onCloseAnimationComplete?.()
      closeInFlightRef.current = false
      return
    }

    const transformOrigin = getTransformOrigin()

    setAnimationStyles({
      transformOrigin,
      transform: 'scale(0.92)',
      opacity: 0,
      transition: closeAnimationTransition,
    })

    animationTimeoutRef.current = setTimeout(() => {
      setAnimationStyles({})
      onClose()
      onCloseAnimationComplete?.()
      closeInFlightRef.current = false
    }, closeAnimationDuration)
  }, [
    closeAnimationDuration,
    closeAnimationTransition,
    getTransformOrigin,
    onClose,
    resolvedAnimationMode,
    onCloseAnimationComplete,
    prefersReducedMotion,
    session,
  ])

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

  useLayoutEffect(() => {
    if (isOpen) {
      closeInFlightRef.current = false
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

      if (!prefersReducedMotion) {
        setIsAnimating(true)

        requestAnimationFrame(() => {
          const transformOrigin = getTransformOrigin()

          setAnimationStyles({
            transformOrigin,
            transform: resolvedAnimationMode === 'origin-point' ? 'scale(0.92)' : 'scale(0.97)',
            opacity: 0,
            transition: 'none',
          })

          requestAnimationFrame(() => {
            setAnimationStyles({
              transformOrigin,
              transform: 'scale(1)',
              opacity: 1,
              transition: openAnimationTransition,
            })

            animationTimeoutRef.current = setTimeout(() => {
              setIsAnimating(false)
              setAnimationStyles({})
            }, openAnimationDuration)
          })
        })
      }
    } else {
      closeInFlightRef.current = false
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
  }, [
    getTransformOrigin,
    handleKeyDown,
    isOpen,
    openAnimationDuration,
    openAnimationTransition,
    prefersReducedMotion,
    resolvedAnimationMode,
  ])

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
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-preview-title"
    >
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
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-foreground bg-surface hover:bg-surface-light rounded-md motion-color motion-press focus-ring cursor-pointer"
              aria-label={t('kanban.expand', 'Expand to full view')}
            >
              <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">{t('kanban.expand', 'Expand')}</span>
            </button>
            <button
              onClick={handleCloseWithAnimation}
              className="p-1.5 sm:p-2 text-muted-foreground hover:text-foreground hover:bg-surface-light rounded-md motion-color motion-press focus-ring cursor-pointer"
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
