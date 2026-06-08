import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal, Globe, Star, Trash2, Check, Copy, ArrowRightLeft, X, GitBranch } from 'lucide-react'
import type { Tag } from '@/types'
import { getColorClass, getColorStyle } from '@/components/tags/TagBadge'

const CONFIRM_TIMEOUT_MS = 3000



interface SessionContextMenuProps {
  x: number
  y: number
  sessionId: string
  tags: Tag[]
  sessionTagIds: string[]
  onToggleTag: (tagId: string, assigned: boolean) => void
  onOpenTerminal?: () => void
  onOpenBrowser?: () => void
  onConvert?: () => void
  onToggleFavorite?: () => void
  onCopyResume?: () => void
  onFork?: () => void
  onDelete?: () => void
  onDeleteDirect?: () => void
  isFavorite?: boolean
  onClose: () => void
}

export default function SessionContextMenu({
  x, y, tags, sessionTagIds,
  onToggleTag, onOpenTerminal, onOpenBrowser,
  onConvert, onToggleFavorite, onCopyResume, onFork, onDelete, onDeleteDirect, isFavorite, onClose,
}: SessionContextMenuProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false)
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
      setIsDeleteConfirming(false)
    }, CONFIRM_TIMEOUT_MS)
  }, [clearConfirmTimeout])

  useEffect(() => {
    return () => clearConfirmTimeout()
  }, [clearConfirmTimeout])

  const handleDeleteClick = useCallback(() => {
    if (isDeleteConfirming && onDeleteDirect) {
      // Second click - execute delete
      clearConfirmTimeout()
      setIsDeleteConfirming(false)
      onDeleteDirect()
      onClose()
    } else if (isDeleteConfirming && onDelete) {
      // Second click for popover mode - execute delete directly without popover
      clearConfirmTimeout()
      setIsDeleteConfirming(false)
      onDelete()
      onClose()
    } else {
      // First click - show confirm
      setIsDeleteConfirming(true)
      startConfirmTimeout()
    }
  }, [isDeleteConfirming, onDeleteDirect, onDelete, clearConfirmTimeout, startConfirmTimeout, onClose])

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [onClose])

  // Clamp position to viewport
  const menuW = 200, menuH = 300
  const left = Math.min(x, window.innerWidth - menuW - 8)
  const top = Math.min(y, window.innerHeight - menuH - 8)

  return (
    <div
      ref={ref}
      className="fixed z-[9999] w-52 bg-card border border-border rounded-lg shadow-xl overflow-hidden py-1"
      style={{ left, top }}
    >
      {/* Tag submenu */}
      <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        {t('tags.contextMenu.labels')}
      </div>
      <div className="max-h-40 overflow-y-auto">
        {tags.map(tag => {
          const assigned = sessionTagIds.includes(tag.id)
          const isHex = tag.color.startsWith('#')
          return (
            <button
              key={tag.id}
              onClick={() => onToggleTag(tag.id, assigned)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-secondary motion-color motion-press focus-ring"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${isHex ? '' : getColorClass(tag.color)}`}
                style={getColorStyle(tag.color)}
              />
              <span className="flex-1 text-xs text-foreground truncate">{tag.name}</span>
              {assigned && <Check className="h-3 w-3 text-info" />}
            </button>
          )
        })}
      </div>

      <div className="border-t border-border/50 my-1" />

      {onOpenTerminal && (
        <button onClick={() => { onOpenTerminal(); onClose() }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-secondary motion-color motion-press focus-ring">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-foreground">{t('tags.contextMenu.openTerminal')}</span>
        </button>
      )}
      {onOpenBrowser && (
        <button onClick={() => { onOpenBrowser(); onClose() }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-secondary motion-color motion-press focus-ring">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-foreground">{t('tags.contextMenu.openBrowser')}</span>
        </button>
      )}
      {onConvert && (
        <button onClick={() => { onConvert(); onClose() }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-secondary motion-color motion-press focus-ring">
          <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-foreground">{t('session.convert.title')}</span>
        </button>
      )}
      {onToggleFavorite && (
        <button onClick={() => { onToggleFavorite(); onClose() }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-secondary motion-color motion-press focus-ring">
          <Star className={`h-3.5 w-3.5 ${isFavorite ? 'text-yellow-400 fill-current' : 'text-muted-foreground'}`} />
          <span className="text-xs text-foreground">{t('tags.contextMenu.favorite')}</span>
        </button>
      )}
      {onCopyResume && (
        <button onClick={() => { onCopyResume(); onClose() }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-secondary motion-color motion-press focus-ring">
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-foreground">{t('tags.contextMenu.copyResume')}</span>
        </button>
      )}
      {onFork && (
        <button onClick={() => { onFork(); onClose() }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-secondary motion-color motion-press focus-ring">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-foreground">{t('tags.contextMenu.fork')}</span>
        </button>
      )}

      {(onDelete || onDeleteDirect) && (
        <>
          <div className="border-t border-border/50 my-1" />
          {isDeleteConfirming ? (
            <div className="px-3 py-1.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeleteClick}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded bg-red-600 px-2 py-1.5 text-[10px] text-white hover:bg-red-700 motion-color motion-press focus-ring"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>{t('common.confirm', { defaultValue: 'Confirm?' })}</span>
                </button>
                <button
                  onClick={() => {
                    clearConfirmTimeout()
                    setIsDeleteConfirming(false)
                  }}
                  className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary motion-color motion-press focus-ring"
                  title={t('common.cancel')}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={handleDeleteClick}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-red-500/10 motion-color motion-press focus-ring"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs text-red-500">{t('tags.contextMenu.delete')}</span>
            </button>
          )}
        </>
      )}
    </div>
  )
}
