import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, Terminal, Globe, Star, Trash2, Tag, X, Copy, Pencil } from 'lucide-react'
import type { SessionInfo, Tag as TagType, FavoriteItem } from '@/types'
import type { DeleteSessionAnchorPoint } from '@/components/dialogs/deleteSessionTypes'
import TagBadge from '@/components/tags/TagBadge'

const CONFIRM_TIMEOUT_MS = 3000

interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}

interface ContextMenuProps {
  session: SessionInfo
  tags: TagType[]
  allTags: TagType[]
  favorites: FavoriteItem[]
  position: { x: number; y: number }
  onClose: () => void
  onOpenInTerminal: () => void
  onOpenInBrowser: () => void
  onToggleFavorite: () => void
  onResume?: () => void
  onCopyResume?: () => void
  onRename?: () => void
  onToggleTag: (tagId: string, assigned: boolean) => void
  onDelete: (anchorPoint: DeleteSessionAnchorPoint) => void
}

export default function KanbanContextMenu({
  session,
  tags,
  allTags,
  favorites,
  position,
  onClose,
  onOpenInTerminal,
  onOpenInBrowser,
  onToggleFavorite,
  onResume,
  onCopyResume,
  onRename,
  onToggleTag,
  onDelete,
}: ContextMenuProps) {
  const { t } = useTranslation()
  const [adjustedPosition, setAdjustedPosition] = useState(position)
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false)
  const deleteConfirmTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const clearDeleteConfirmTimeout = useCallback(() => {
    if (deleteConfirmTimeoutRef.current) {
      clearTimeout(deleteConfirmTimeoutRef.current)
      deleteConfirmTimeoutRef.current = null
    }
  }, [])

  const startDeleteConfirmTimeout = useCallback(() => {
    clearDeleteConfirmTimeout()
    deleteConfirmTimeoutRef.current = setTimeout(() => {
      setIsDeleteConfirming(false)
    }, CONFIRM_TIMEOUT_MS)
  }, [clearDeleteConfirmTimeout])

  useEffect(() => {
    return () => clearDeleteConfirmTimeout()
  }, [clearDeleteConfirmTimeout])

  // Adjust position to keep menu within viewport
  useEffect(() => {
    const menuWidth = 200
    const menuHeight = 260 + Math.min(allTags.length, 6) * 30
    const padding = 10

    let x = position.x
    let y = position.y

    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding
    }
    if (y + menuHeight > window.innerHeight - padding) {
      y = window.innerHeight - menuHeight - padding
    }

    setAdjustedPosition({ x, y })
  }, [position, allTags.length])

  // Close on outside click or escape
  useEffect(() => {
    const handleClick = () => onClose()
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const isFavorite = favorites.some(f => f.id === session.id)

  const menuItems: ContextMenuItem[] = [
    {
      id: 'terminal',
      label: t('session.openInTerminal'),
      icon: <Terminal size={14} />,
      onClick: onOpenInTerminal,
    },
    {
      id: 'browser',
      label: t('session.openInBrowser'),
      icon: <Globe size={14} />,
      onClick: onOpenInBrowser,
    },
    {
      id: 'favorite',
      label: isFavorite ? t('favorites.remove') : t('favorites.add'),
      icon: <Star size={14} className={isFavorite ? 'fill-yellow-400 text-yellow-400' : ''} />,
      onClick: onToggleFavorite,
    },
    ...(onResume ? [{
      id: 'resume' as const,
      label: `${t('session.resume', 'Resume')} (⌘R)`,
      icon: <Play size={14} />,
      onClick: onResume,
    }] : []),
    ...(onCopyResume ? [{
      id: 'copyResume' as const,
      label: t('tags.contextMenu.copyResume'),
      icon: <Copy size={14} />,
      onClick: onCopyResume,
    }] : []),
    ...(onRename ? [{
      id: 'rename' as const,
      label: t('tags.contextMenu.rename', { defaultValue: t('common.rename') }),
      icon: <Pencil size={14} />,
      onClick: onRename,
    }] : []),
    { id: 'separator1', label: '', onClick: () => {} },
  ]

  const handleItemClick = useCallback((item: ContextMenuItem, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()

    item.onClick()
    onClose()
  }, [onClose])

  return (
    <div
      className="fixed z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[180px] ui-enter-zoom"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {menuItems.map((item) => {
        if (item.id.startsWith('separator')) {
          return <div key={item.id} className="my-1 border-t border-border/50" />
        }

        return (
          <button
            key={item.id}
            onClick={(e) => handleItemClick(item, e)}
            disabled={item.disabled}
            className={[
              'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] motion-color focus-ring',
              'hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed',
              item.danger ? 'text-red-500 hover:bg-red-500/10' : 'text-foreground',
            ].join(' ')}
          >
            {item.icon && <span className="text-muted-foreground">{item.icon}</span>}
            <span className="flex-1 text-left">{item.label}</span>
          </button>
        )
      })}
      <div className="px-3 pb-1 text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
        <Tag size={12} />
        {t('tags.contextMenu.labels')}
      </div>
      <div className="max-h-[200px] overflow-y-auto pb-1">
        {allTags.length === 0 ? (
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground">{t('tags.empty')}</div>
        ) : (
          allTags.map(tag => {
            const isAssigned = tags.some(t => t.id === tag.id)
            return (
              <button
                key={tag.id}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleTag(tag.id, isAssigned)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-muted motion-color focus-ring text-foreground"
              >
                <div className="flex items-center gap-2 flex-1 overflow-hidden">
                  <TagBadge tag={tag} compact />
                  <span className="flex-1 text-left truncate">{tag.name}</span>
                </div>
                {isAssigned && (
                  <svg className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            )
          })
        )}
      </div>
      <div className="my-1 border-t border-border/50" />
      {isDeleteConfirming ? (
        <div className="px-2 py-1">
          <div className="flex items-center gap-1">
            <button
              onClick={(event) => {
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                clearDeleteConfirmTimeout()
                onDelete({
                  x: rect.left + rect.width / 2,
                  y: rect.bottom,
                })
                onClose()
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded bg-red-600 px-2 py-1.5 text-[10px] text-white hover:bg-red-700 motion-color focus-ring"
            >
              <Trash2 className="h-3 w-3" />
              <span>{t('common.confirm', { defaultValue: 'Confirm?' })}</span>
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation()
                clearDeleteConfirmTimeout()
                setIsDeleteConfirming(false)
              }}
              className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary motion-color focus-ring"
              title={t('common.cancel')}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={(event) => {
            event.stopPropagation()
            setIsDeleteConfirming(true)
            startDeleteConfirmTimeout()
          }}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-red-500 hover:bg-red-500/10 motion-color focus-ring"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="flex-1 text-left text-xs">{t('common.delete')}</span>
        </button>
      )}
    </div>
  )
}
