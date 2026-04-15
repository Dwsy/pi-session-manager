import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionInfo } from '@/types'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { DeleteSessionAnchorPoint } from './deleteSessionTypes'

const POPOVER_WIDTH = 280
const VIEWPORT_PADDING = 16
const OFFSET = 8

export function getDeletePopoverPosition({
  anchorRect,
  anchorPoint,
  popoverWidth = POPOVER_WIDTH,
  popoverHeight,
  viewportWidth,
  viewportHeight,
  offset = OFFSET,
  padding = VIEWPORT_PADDING,
}: {
  anchorRect?: DOMRect | null
  anchorPoint?: DeleteSessionAnchorPoint | null
  popoverWidth?: number
  popoverHeight: number
  viewportWidth: number
  viewportHeight: number
  offset?: number
  padding?: number
}): { top: number; left: number } {
  const fallbackLeft = Math.max(padding, Math.round((viewportWidth - popoverWidth) / 2))
  const fallbackTop = Math.max(padding, Math.round((viewportHeight - popoverHeight) / 2))

  if (!anchorRect && !anchorPoint) {
    return { top: fallbackTop, left: fallbackLeft }
  }

  const anchorLeft = anchorRect?.left ?? anchorPoint?.x ?? fallbackLeft
  const anchorRight = anchorRect?.right ?? anchorPoint?.x ?? fallbackLeft
  const anchorTop = anchorRect?.top ?? anchorPoint?.y ?? fallbackTop
  const anchorBottom = anchorRect?.bottom ?? anchorPoint?.y ?? fallbackTop

  let left = anchorLeft
  const maxLeft = viewportWidth - popoverWidth - padding
  if (left > maxLeft) {
    left = Math.max(padding, anchorRight - popoverWidth)
  }
  left = Math.min(Math.max(left, padding), Math.max(padding, maxLeft))

  const belowTop = anchorBottom + offset
  const aboveTop = anchorTop - popoverHeight - offset
  let top = belowTop

  if (top + popoverHeight > viewportHeight - padding && aboveTop >= padding) {
    top = aboveTop
  }

  const maxTop = viewportHeight - popoverHeight - padding
  top = Math.min(Math.max(top, padding), Math.max(padding, maxTop))

  return {
    top: Math.round(top),
    left: Math.round(left),
  }
}

interface DeleteSessionPopoverProps {
  sessions: SessionInfo[]
  anchorRef?: React.RefObject<HTMLElement | null>
  anchorPoint?: DeleteSessionAnchorPoint | null
  onConfirm: () => Promise<void>
  onCancel: () => void
  onConfirmStart?: () => void
}

export default function DeleteSessionPopover({
  sessions,
  anchorRef,
  anchorPoint,
  onConfirm,
  onCancel,
  onConfirmStart,
}: DeleteSessionPopoverProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [isDeleting, setIsDeleting] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const popoverRef = useRef<HTMLDivElement>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const updatePosition = useCallback(() => {
    if (isMobile) {
      return
    }

    const popoverHeight = popoverRef.current?.offsetHeight ?? (sessions.length > 1 ? 212 : 176)
    const nextPosition = getDeletePopoverPosition({
      anchorRect: anchorRef?.current?.getBoundingClientRect() ?? null,
      anchorPoint,
      popoverHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
    setPosition(nextPosition)
  }, [anchorPoint, anchorRef, isMobile, sessions.length])

  useEffect(() => {
    updatePosition()

    if (isMobile) {
      return
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isMobile, updatePosition])

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
      data-delete-session-dialog="true"
      className={[
        'fixed z-[10000] rounded-lg border border-border/70 bg-background shadow-2xl',
        isMobile ? 'inset-x-4 top-1/2 w-auto -translate-y-1/2' : 'w-[280px]',
      ].join(' ')}
      style={isMobile ? undefined : {
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
