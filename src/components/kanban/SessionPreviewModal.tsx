import { useEffect, useCallback } from 'react'
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
}: SessionPreviewModalProps) {
  const { t } = useTranslation()

  // Handle ESC key to close modal
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
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, handleKeyDown])

  // Handle overlay click to close
  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  // Handle expand button click
  const handleExpand = () => {
    onExpand()
  }

  if (!isOpen || !session) {
    return null
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-preview-title"
    >
      {/* Modal Container - 90vw × 90vh, centered */}
      <div
        className="bg-surface rounded-lg shadow-2xl flex flex-col overflow-hidden border border-border"
        style={{ width: '90vw', height: '90vh' }}
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
