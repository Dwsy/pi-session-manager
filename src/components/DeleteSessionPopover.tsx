import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionInfo } from '../types'

interface DeleteSessionPopoverProps {
  sessions: SessionInfo[]
  anchorRef: React.RefObject<HTMLElement>
  onConfirm: () => Promise<void>
  onCancel: () => void
  onConfirmStart?: () => void
}

export default function DeleteSessionPopover({
  sessions,
  anchorRef,
  onConfirm,
  onCancel,
  onConfirmStart,
}: DeleteSessionPopoverProps) {
  const { t } = useTranslation()
  const [isDeleting, setIsDeleting] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const popoverRef = useRef<HTMLDivElement>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Calculate position relative to anchor
  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return

    const rect = anchor.getBoundingClientRect()
    const popoverWidth = 280
    const popoverHeight = sessions.length > 1 ? 180 : 120

    // Position below and to the right of anchor
    let top = rect.bottom + window.scrollY + 8
    let left = rect.left + window.scrollX

    // Ensure within viewport
    if (left + popoverWidth > window.innerWidth + window.scrollX) {
      left = window.innerWidth + window.scrollX - popoverWidth - 16
    }
    if (top + popoverHeight > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - popoverHeight - 8
    }

    setPosition({ top, left })
  }, [anchorRef, sessions.length])

  const handleConfirm = async () => {
    if (isDeleting) return

    setIsDeleting(true)
    onConfirmStart?.()
    try {
      await onConfirm()
    } finally {
      if (isMountedRef.current) {
        setIsDeleting(false)
      }
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) {
        event.preventDefault()
        event.stopPropagation()
        onCancel()
        return
      }

      if (event.key === 'Enter' && !isDeleting) {
        event.preventDefault()
        event.stopPropagation()
        void handleConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [handleConfirm, isDeleting, onCancel])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onCancel()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onCancel])

  const isBatchDelete = sessions.length > 1
  const firstSession = sessions[0]
  const sessionName = firstSession?.name || t('common.untitled')
  const previewSessions = sessions.slice(0, 3)

  return (
    <div
      ref={popoverRef}
      className="fixed z-[10000] w-[280px] rounded-lg border border-border/70 bg-background shadow-2xl"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-2 border-b border-border/50 px-3 py-2.5">
        <div className="mt-0.5 rounded-full bg-red-500/12 p-1 text-red-500">
          <AlertTriangle className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            {isBatchDelete
              ? t('session.list.deleteSelected', {
                  count: sessions.length,
                  defaultValue: 'Delete {{count}} sessions',
                })
              : t('common.deleteSession')}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isBatchDelete
              ? t('app.confirm.deleteSessions', {
                  count: sessions.length,
                  defaultValue: 'Delete {{count}} selected sessions?',
                })
              : t('app.confirm.deleteSession', { name: sessionName })}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={isDeleting}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          aria-label={t('common.close')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Warning */}
      <div className="px-3 py-2">
        <p className="text-xs text-red-500/90">
          {t('app.confirm.deleteIrreversible', {
            defaultValue: 'This action cannot be undone.',
          })}
        </p>
      </div>

      {/* Session path preview */}
      {isBatchDelete ? (
        <div className="max-h-20 space-y-0.5 overflow-y-auto border-t border-border/40 bg-secondary/20 px-3 py-2 text-[10px] text-muted-foreground/80">
          {previewSessions.map((session) => (
            <p key={session.id} className="break-all">
              {session.name || t('common.untitled')}
            </p>
          ))}
          {sessions.length > previewSessions.length && (
            <p className="text-muted-foreground/60">
              {t('common.moreItems', {
                count: sessions.length - previewSessions.length,
                defaultValue: '+{{count}} more',
              })}
            </p>
          )}
        </div>
      ) : (
        <div className="border-t border-border/40 bg-secondary/20 px-3 py-2">
          <p className="break-all text-[10px] text-muted-foreground/80">
            {firstSession?.path}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-1.5 border-t border-border/50 px-3 py-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isDeleting}
          className="rounded px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isDeleting}
          className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDeleting && <Loader2 className="h-3 w-3 animate-spin" />}
          {isBatchDelete
            ? t('session.list.deleteSelected', {
                count: sessions.length,
                defaultValue: 'Delete {{count}}',
              })
            : t('common.delete')}
        </button>
      </div>
    </div>
  )
}
