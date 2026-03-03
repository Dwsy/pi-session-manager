import { useEffect, useRef, useState } from 'react'
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isDeleting) {
          onCancel()
        }
      }}
    >
      <div className={`rounded-lg border border-border bg-background p-6 ${isMobile ? 'w-[95vw]' : 'w-[30rem]'}`}>
        <h3 className="mb-2 text-lg font-semibold">
          {isBatchDelete
            ? t('common.deleteSessions', { defaultValue: 'Delete sessions' })
            : t('common.deleteSession')}
        </h3>
        <p className="mb-2 text-sm text-muted-foreground">
          {isBatchDelete
            ? t('app.confirm.deleteSessions', {
              count: sessions.length,
              defaultValue: 'Delete {{count}} selected sessions?',
            })
            : t('app.confirm.deleteSession', { name: sessionName })}
        </p>
        {isBatchDelete ? (
          <div className="mb-6 space-y-1 text-xs text-muted-foreground/80">
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
          <p className="mb-6 break-all text-xs text-muted-foreground/80">{firstSession?.path}</p>
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
            className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 motion-color motion-press focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
