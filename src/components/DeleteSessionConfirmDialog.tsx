import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionInfo } from '../types'
import { useIsMobile } from '../hooks/useIsMobile'

interface DeleteSessionConfirmDialogProps {
  sessions: SessionInfo[]
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export default function DeleteSessionConfirmDialog({
  sessions,
  onConfirm,
  onCancel,
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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDeleting, onCancel])

  const handleConfirm = async () => {
    if (isDeleting) {
      return
    }

    setIsDeleting(true)
    try {
      await onConfirm()
    } finally {
      if (isMountedRef.current) {
        setIsDeleting(false)
      }
    }
  }

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[2px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isDeleting) {
          onCancel()
        }
      }}
    >
      <div className={`rounded-xl border border-border/70 bg-background p-6 shadow-2xl ${isMobile ? 'w-[95vw]' : 'w-[30rem]'}`}>
        <div className="mb-3 flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-red-500/12 p-1.5 text-red-500">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">
              {isBatchDelete
                ? t('common.deleteSessions', { defaultValue: 'Delete sessions' })
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

        <p className="mb-3 text-xs text-red-500/90">
          {t('app.confirm.deleteIrreversible', {
            defaultValue: 'This action cannot be undone.',
          })}
        </p>

        {isBatchDelete ? (
          <div className="mb-5 max-h-36 space-y-1 overflow-y-auto rounded-md border border-border/60 bg-secondary/25 p-2 text-xs text-muted-foreground/85">
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
          <p className="mb-5 break-all rounded-md border border-border/60 bg-secondary/25 p-2 text-xs text-muted-foreground/85">
            {firstSession?.path}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground motion-color motion-press focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleConfirm()
            }}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 motion-color motion-press focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {deleteActionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
