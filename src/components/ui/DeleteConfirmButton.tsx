import { useState, useRef, useEffect, useCallback } from 'react'
import { Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface DeleteConfirmButtonProps {
  onDelete: () => void
  size?: 'sm' | 'md'
  className?: string
}

const CONFIRM_TIMEOUT_MS = 3000

export default function DeleteConfirmButton({
  onDelete,
  size = 'sm',
  className = '',
}: DeleteConfirmButtonProps) {
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

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()

      if (isConfirming) {
        // Second click - execute delete
        clearConfirmTimeout()
        setIsConfirming(false)
        onDelete()
      } else {
        // First click - show confirm
        setIsConfirming(true)
        startConfirmTimeout()
      }
    },
    [isConfirming, onDelete, clearConfirmTimeout, startConfirmTimeout]
  )

  const handleCancel = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      clearConfirmTimeout()
      setIsConfirming(false)
    },
    [clearConfirmTimeout]
  )

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  const cancelIconSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'

  if (isConfirming) {
    return (
      <div className={`inline-flex items-center gap-1 ${className}`}>
        <button
          onClick={handleClick}
          className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-[10px] text-white hover:bg-red-700 motion-color focus-ring"
          title={t('app.confirm.deleteIrreversible', { defaultValue: 'This action cannot be undone' })}
        >
          <span>{t('common.confirm', { defaultValue: 'Confirm?' })}</span>
        </button>
        <button
          onClick={handleCancel}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary motion-color focus-ring"
          title={t('common.cancel')}
        >
          <X className={cancelIconSize} />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleClick}
      className="p-1 text-muted-foreground/60 hover:text-red-500 rounded motion-color focus-ring"
      title={t('common.deleteSession')}
    >
      <Trash2 className={iconSize} />
    </button>
  )
}
