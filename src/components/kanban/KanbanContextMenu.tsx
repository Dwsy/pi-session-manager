import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal, Globe, Star, Trash2, Tag, X } from 'lucide-react'
import type { SessionInfo, Tag as TagType, FavoriteItem } from '../../types'
import TagBadge from '../TagBadge'

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
  onToggleTag: (tagId: string, assigned: boolean) => void
  onDelete: () => void
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
  onToggleTag,
  onDelete,
}: ContextMenuProps) {
  const { t } = useTranslation()
  const [adjustedPosition, setAdjustedPosition] = useState(position)
  const [showTagSubmenu, setShowTagSubmenu] = useState(false)

  // Adjust position to keep menu within viewport
  useEffect(() => {
    const menuWidth = 200
    const menuHeight = showTagSubmenu ? 300 : 220
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
  }, [position, showTagSubmenu])

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
    {
      id: 'tags',
      label: t('tags.manage'),
      icon: <Tag size={14} />,
      onClick: () => setShowTagSubmenu(true),
    },
    { id: 'separator1', label: '', onClick: () => {} },
    {
      id: 'delete',
      label: t('common.delete'),
      icon: <Trash2 size={14} />,
      danger: true,
      onClick: onDelete,
    },
  ]

  const handleItemClick = useCallback((item: ContextMenuItem, e: React.MouseEvent) => {
    e.stopPropagation()
    item.onClick()
    if (item.id !== 'tags') {
      onClose()
    }
  }, [onClose])

  if (showTagSubmenu) {
    return (
      <div
        className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
        style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Back button */}
        <button
          onClick={() => setShowTagSubmenu(false)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted transition-colors border-b border-border/50"
        >
          <X size={12} />
          {t('common.back')}
        </button>

        {/* Tag list */}
        <div className="max-h-[200px] overflow-y-auto py-1">
          {allTags.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">
              {t('tags.empty')}
            </div>
          ) : (
            allTags.map(tag => {
              const isAssigned = tags.some(t => t.id === tag.id)
              return (
                <button
                  key={tag.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleTag(tag.id, isAssigned)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-1.5 flex-1">
                    <TagBadge tag={tag} compact />
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
      </div>
    )
  }

  return (
    <div
      className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
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
              'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors',
              'hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed',
              item.danger ? 'text-red-500 hover:bg-red-500/10' : 'text-foreground',
            ].join(' ')}
          >
            {item.icon && <span className="text-muted-foreground">{item.icon}</span>}
            <span className="flex-1 text-left">{item.label}</span>
            {item.id === 'tags' && (
              <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}
