import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionInfo } from '@/types'
import { useIsMobile } from '@/hooks/useIsMobile'

interface DeleteSessionConfirmDialogProps {
  sessions: SessionInfo[]
  onConfirm: () => Promise<void>
  onCancel: () => void
  onConfirmStart?: () => void
}

export default function DeleteSessionConfirmDialog({
  sessions,
  onConfirm,
  onCancel,
  onConfirmStart,
}: DeleteSessionConfirmDialogProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [isDeleting, setIsDeleting] = useState(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleConfirm = async () => {
    if (isDeleting) {
      return
    }

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

  const shouldConfirmOnEnter = (event: KeyboardEvent): boolean => {
    const target = event.target
    return !(target instanceof HTMLElement && target.dataset.deleteDialogAction === 'cancel')
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        onCancel()
        return
      }

      if (event.key === 'Enter' && !isDeleting && shouldConfirmOnEnter(event)) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        void handleConfirm()
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [handleConfirm, isDeleting, onCancel])

  const isBatchDelete = sessions.length > 1
  const firstSession = sessions[0]
  const sessionName = firstSession?.name || t('common.untitled')
  const previewSessions = sessions.slice(0, 3)
  const deleteActionLabel = isBatchDelete
    ? t('session.list.deleteSelected', {
        count: sessions.length,
        defaultValue: 'Delete {{count}}',
      })
    : t('common.delete')

  return (
    <div
      data-delete-session-dialog="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isDeleting) {
          onCancel()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-session-title"
        className={`rounded-lg border border-border bg-background p-5 shadow-xl ${isMobile ? 'w-[95vw]' : 'w-[30rem]'}`}
      >
        <div className="mb-3 flex items-start gap-3">
          <div className="mt-0.5 text-destructive">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 id="delete-session-title" className="text-base font-semibold text-foreground">
              {isBatchDelete
                ? t('common.deleteSessions', {
                    defaultValue: 'Delete sessions',
                  })
                : t('common.deleteSession')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {isBatchDelete
                ? t('app.confirm.deleteSessions', {
                    count: sessions.length,
                    defaultValue: 'Delete {{count}} selected sessions?',
                  })
                : t('app.confirm.deleteSession', { name: sessionName })}
            </p>
          </div>
        </div>

        <p className="mb-3 text-xs text-destructive">
          {t('app.confirm.deleteIrreversible', {
            defaultValue: 'This action cannot be undone.',
          })}
        </p>

        {isBatchDelete ? (
          <div className="mb-5 max-h-36 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground/85">
            {previewSessions.map((session) => (
              <p key={session.id} className="break-all">
                {session.name || t('common.untitled')} · {session.path}
              </p>
            ))}
            {sessions.length > previewSessions.length && (
              <p className="text-muted-foreground/70">
                {t('common.moreItems', {
                  count: sessions.length - previewSessions.length,
                  defaultValue: '+{{count}} more',
                })}
              </p>
            )}
          </div>
        ) : (
          <p className="mb-5 break-all rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground/85">
            {firstSession?.path}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-delete-dialog-action="cancel"
            onClick={onCancel}
            disabled={isDeleting}
            className="focus-ring rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleConfirm()
            }}
            disabled={isDeleting}
            className="focus-ring inline-flex items-center gap-1.5 rounded-md bg-destructive px-4 py-2 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {deleteActionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
