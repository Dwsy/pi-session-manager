import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal, Globe, Star, Trash2, Check } from 'lucide-react'
import type { Tag } from '../types'
import { getColorClass, getColorStyle } from './TagBadge'

interface SessionContextMenuProps {
  x: number
  y: number
  sessionId: string
  tags: Tag[]
  sessionTagIds: string[]
  onToggleTag: (tagId: string, assigned: boolean) => void
  onOpenTerminal?: () => void
  onOpenBrowser?: () => void
  onToggleFavorite?: () => void
  onDelete?: () => void
  isFavorite?: boolean
  onClose: () => void
}

export default function SessionContextMenu({
  x, y, tags, sessionTagIds,
  onToggleTag, onOpenTerminal, onOpenBrowser,
  onToggleFavorite, onDelete, isFavorite, onClose,
}: SessionContextMenuProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
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
      className="fixed z-[9999] w-52 bg-surface border border-border rounded-lg shadow-xl overflow-hidden py-1"
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
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-secondary transition-colors"
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
        <button onClick={() => { onOpenTerminal(); onClose() }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-secondary transition-colors">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-foreground">{t('tags.contextMenu.openTerminal')}</span>
        </button>
      )}
      {onOpenBrowser && (
        <button onClick={() => { onOpenBrowser(); onClose() }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-secondary transition-colors">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-foreground">{t('tags.contextMenu.openBrowser')}</span>
        </button>
      )}
      {onToggleFavorite && (
        <button onClick={() => { onToggleFavorite(); onClose() }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-secondary transition-colors">
          <Star className={`h-3.5 w-3.5 ${isFavorite ? 'text-yellow-400 fill-current' : 'text-muted-foreground'}`} />
          <span className="text-xs text-foreground">{t('tags.contextMenu.favorite')}</span>
        </button>
      )}

      {onDelete && (
        <>
          <div className="border-t border-border/50 my-1" />
          <button onClick={() => { onDelete(); onClose() }} className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-red-500/10 transition-colors">
            <Trash2 className="h-3.5 w-3.5 text-red-500" />
            <span className="text-xs text-red-500">{t('tags.contextMenu.delete')}</span>
          </button>
        </>
      )}
    </div>
  )
}
