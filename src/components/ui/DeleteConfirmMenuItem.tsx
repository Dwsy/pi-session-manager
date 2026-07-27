import { useState, useRef, useCallback, useEffect } from 'react'
import { Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface DeleteConfirmMenuItemProps {
  onDelete: () => void
  onClose: () => void
  label?: string
}

const CONFIRM_TIMEOUT_MS = 3000

export default function DeleteConfirmMenuItem({
  onDelete,
  onClose,
  label,
}: DeleteConfirmMenuItemProps) {
  const { t } = useTranslation()
  const [isConfirming, setIsConfirming] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const clearConfirmTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const startConfirmTimeout = useCallback(() => {
    clearConfirmTimeout()
    timeoutRef.current = setTimeout(() => {
      setIsConfirming(false)
    }, CONFIRM_TIMEOUT_MS)
  }, [clearConfirmTimeout])

  useEffect(() => {
    return () => clearConfirmTimeout()
  }, [clearConfirmTimeout])

  const handleClick = useCallback(() => {
    if (isConfirming) {
      // Second click - execute delete
      clearConfirmTimeout()
      setIsConfirming(false)
      onDelete()
      onClose()
    } else {
      // First click - show confirm
      setIsConfirming(true)
      startConfirmTimeout()
    }
  }, [isConfirming, onDelete, onClose, clearConfirmTimeout, startConfirmTimeout])

  const handleCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    clearConfirmTimeout()
    setIsConfirming(false)
  }, [clearConfirmTimeout])

  if (isConfirming) {
    return (
      <>
        <div className="border-t border-border/50 my-1" />
        <div className="px-2 py-1">
          <div className="flex items-center gap-1">
            <button
              onClick={handleClick}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded bg-red-600 px-2 py-1.5 text-[10px] text-white hover:bg-red-700 motion-color focus-ring"
            >
              <Trash2 className="h-3 w-3" />
              <span>{t('common.confirm', { defaultValue: 'Confirm?' })}</span>
            </button>
            <button
              onClick={handleCancel}
              className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary motion-color focus-ring"
              title={t('common.cancel')}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="border-t border-border/50 my-1" />
      <button
        onClick={handleClick}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-red-500/10 motion-color focus-ring"
      >
        <Trash2 className="h-3.5 w-3.5 text-red-500" />
        <span className="text-xs text-red-500">{label || t('tags.contextMenu.delete')}</span>
      </button>
    </>
  )
}
