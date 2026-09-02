import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, CircleDot, Copy, Globe, Pencil, Play, Star, Tag, Terminal, Trash2, X } from 'lucide-react'
import type { SessionInfo, Tag as StatusType, FavoriteItem } from '@/types'
import type { DeleteSessionAnchorPoint } from '@/components/dialogs/deleteSessionTypes'
import TagBadge from '@/components/tags/TagBadge'
import KanbanLabelBadge from '../labels/KanbanLabelBadge'
import type { KanbanLabel } from '../labels/kanbanLabelsStore'

const CONFIRM_TIMEOUT_MS = 3000

interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}

interface ContextMenuProps {
  session: SessionInfo
  statuses: StatusType[]
  currentStatusId: string | null
  labels: KanbanLabel[]
  allLabels: KanbanLabel[]
  favorites: FavoriteItem[]
  position: { x: number; y: number }
  onClose: () => void
  onOpenInTerminal: () => void
  onOpenInBrowser: () => void
  onToggleFavorite: () => void
  onResume?: () => void
  onCopyResume?: () => void
  onRename?: () => void
  onSetStatus: (statusId: string | null) => void
  onToggleLabel: (labelId: string, assigned: boolean) => void
  onDelete: (anchorPoint: DeleteSessionAnchorPoint) => void
}

export default function KanbanContextMenu({
  session,
  statuses,
  currentStatusId,
  labels,
  allLabels,
  favorites,
  position,
  onClose,
  onOpenInTerminal,
  onOpenInBrowser,
  onToggleFavorite,
  onResume,
  onCopyResume,
  onRename,
  onSetStatus,
  onToggleLabel,
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
    deleteConfirmTimeoutRef.current = setTimeout(() => setIsDeleteConfirming(false), CONFIRM_TIMEOUT_MS)
  }, [clearDeleteConfirmTimeout])

  useEffect(() => () => clearDeleteConfirmTimeout(), [clearDeleteConfirmTimeout])

  useEffect(() => {
    const menuWidth = 220
    const dynamicRows = Math.min(statuses.length + 1, 6) + Math.min(allLabels.length, 6)
    const menuHeight = 290 + dynamicRows * 30
    const padding = 10
    let x = position.x
    let y = position.y
    if (x + menuWidth > window.innerWidth - padding) x = window.innerWidth - menuWidth - padding
    if (y + menuHeight > window.innerHeight - padding) y = window.innerHeight - menuHeight - padding
    setAdjustedPosition({ x, y })
  }, [position, statuses.length, allLabels.length])

  useEffect(() => {
    const handleClick = () => onClose()
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const isFavorite = favorites.some((favorite) => favorite.id === session.id)
  const menuItems: ContextMenuItem[] = [
    { id: 'terminal', label: t('session.openInTerminal'), icon: <Terminal size={14} />, onClick: onOpenInTerminal },
    { id: 'browser', label: t('session.openInBrowser'), icon: <Globe size={14} />, onClick: onOpenInBrowser },
    { id: 'favorite', label: isFavorite ? t('favorites.remove') : t('favorites.add'), icon: <Star size={14} className={isFavorite ? 'fill-yellow-400 text-yellow-400' : ''} />, onClick: onToggleFavorite },
    ...(onResume ? [{ id: 'resume', label: `${t('session.resume', 'Resume')} (⌘R)`, icon: <Play size={14} />, onClick: onResume }] : []),
    ...(onCopyResume ? [{ id: 'copyResume', label: t('tags.contextMenu.copyResume'), icon: <Copy size={14} />, onClick: onCopyResume }] : []),
    ...(onRename ? [{ id: 'rename', label: t('tags.contextMenu.rename', { defaultValue: t('common.rename') }), icon: <Pencil size={14} />, onClick: onRename }] : []),
  ]

  const handleItemClick = useCallback((item: ContextMenuItem, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    item.onClick()
    onClose()
  }, [onClose])

  return (
    <div
      className="fixed z-50 min-w-[200px] rounded-lg border border-border bg-card py-1 shadow-lg ui-enter-zoom"
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
      onClick={(event) => event.stopPropagation()}
    >
      {menuItems.map((item) => (
        <button
          key={item.id}
          onClick={(event) => handleItemClick(item, event)}
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
      ))}

      <div className="my-1 border-t border-border/50" />
      <div className="flex items-center gap-1.5 px-3 pb-1 text-[10px] font-medium text-muted-foreground">
        <CircleDot size={12} />
        {t('plugins.kanbanBoard.status', 'Status')}
      </div>
      <div className="max-h-[180px] overflow-y-auto pb-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onSetStatus(null)
          }}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-foreground hover:bg-muted motion-color focus-ring"
        >
          <span className="flex-1 text-left text-muted-foreground">{t('plugins.kanbanBoard.noStatus', 'No status')}</span>
          {currentStatusId === null ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
        </button>
        {statuses.map((status) => (
          <button
            key={status.id}
            type="button"
            aria-label={status.name}
            onClick={(event) => {
              event.stopPropagation()
              onSetStatus(status.id)
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-foreground hover:bg-muted motion-color focus-ring"
          >
            <div className="min-w-0 flex-1 text-left"><TagBadge tag={status} compact /></div>
            {currentStatusId === status.id ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
          </button>
        ))}
      </div>

      <div className="my-1 border-t border-border/50" />
      <div className="flex items-center gap-1.5 px-3 pb-1 text-[10px] font-medium text-muted-foreground">
        <Tag size={12} />
        {t('plugins.kanbanBoard.labels', 'Labels')}
      </div>
      <div className="max-h-[200px] overflow-y-auto pb-1">
        {allLabels.length === 0 ? (
          <div className="px-3 py-1.5 text-[11px] text-muted-foreground">{t('plugins.kanbanBoard.labelsEmpty', 'No labels')}</div>
        ) : allLabels.map((label) => {
          const isAssigned = labels.some((assignedLabel) => assignedLabel.id === label.id)
          return (
            <button
              key={label.id}
              type="button"
              title={label.description || label.name}
              onClick={(event) => {
                event.stopPropagation()
                onToggleLabel(label.id, !isAssigned)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-foreground hover:bg-muted motion-color focus-ring"
            >
              <div className="min-w-0 flex-1 text-left"><KanbanLabelBadge label={label} compact /></div>
              {isAssigned ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
            </button>
          )
        })}
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
                onDelete({ x: rect.left + rect.width / 2, y: rect.bottom })
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
              className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground motion-color focus-ring"
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
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-500 hover:bg-red-500/10 motion-color focus-ring"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="flex-1 text-left text-xs">{t('common.delete')}</span>
        </button>
      )}
    </div>
  )
}
