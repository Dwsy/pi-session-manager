import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRightLeft,
  Check,
  Copy,
  GitBranch,
  Globe,
  Pencil,
  Star,
  Terminal,
  Trash2,
  X,
} from 'lucide-react'
import type { Tag } from '@/types'
import { getColorClass, getColorStyle } from '@/components/tags/TagBadge'

const CONFIRM_TIMEOUT_MS = 3000
const MENU_WIDTH = 224
const MENU_ESTIMATED_HEIGHT = 420
const VIEWPORT_GUTTER = 8

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
  onRename?: () => void
  onDelete?: () => void
  onDeleteDirect?: () => void
  pluginActions?: ReactNode
  isFavorite?: boolean
  onClose: () => void
}

interface MenuActionProps {
  icon: ReactNode
  label: ReactNode
  onSelect: () => void
  danger?: boolean
}

function MenuAction({ icon, label, onSelect, danger = false }: MenuActionProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`session-context-menu__item ${danger ? 'session-context-menu__item--danger' : ''}`}
      onClick={onSelect}
    >
      <span className="session-context-menu__icon" aria-hidden="true">{icon}</span>
      <span className="session-context-menu__text">{label}</span>
    </button>
  )
}

export default function SessionContextMenu({
  x,
  y,
  sessionId,
  tags,
  sessionTagIds,
  onToggleTag,
  onOpenTerminal,
  onOpenBrowser,
  onConvert,
  onToggleFavorite,
  onCopyResume,
  onFork,
  onRename,
  onDelete,
  onDeleteDirect,
  pluginActions,
  isFavorite,
  onClose,
}: SessionContextMenuProps) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false)

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
    const frame = requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]')
        ?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const handleOutsidePress = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleOutsidePress)
    document.addEventListener('touchstart', handleOutsidePress)
    return () => {
      document.removeEventListener('mousedown', handleOutsidePress)
      document.removeEventListener('touchstart', handleOutsidePress)
    }
  }, [onClose])

  useEffect(() => () => clearConfirmTimeout(), [clearConfirmTimeout])

  const runAndClose = useCallback((action: () => void) => {
    action()
    onClose()
  }, [onClose])

  const handleDeleteClick = useCallback(() => {
    if (!isDeleteConfirming) {
      setIsDeleteConfirming(true)
      startConfirmTimeout()
      return
    }

    clearConfirmTimeout()
    setIsDeleteConfirming(false)
    if (onDeleteDirect) onDeleteDirect()
    else onDelete?.()
    onClose()
  }, [clearConfirmTimeout, isDeleteConfirming, onClose, onDelete, onDeleteDirect, startConfirmTimeout])

  const focusMenuItem = useCallback((direction: 'first' | 'last' | 'next' | 'previous') => {
    const menu = menuRef.current
    if (!menu) return
    const items = Array.from(
      menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])'),
    )
    if (items.length === 0) return
    const currentIndex = items.indexOf(document.activeElement as HTMLElement)
    let nextIndex = 0
    if (direction === 'last') nextIndex = items.length - 1
    else if (direction === 'next') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length
    else if (direction === 'previous') nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1
    items[nextIndex]?.focus()
  }, [])

  const left = Math.max(
    VIEWPORT_GUTTER,
    Math.min(x, window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER),
  )
  const top = Math.max(
    VIEWPORT_GUTTER,
    Math.min(y, window.innerHeight - MENU_ESTIMATED_HEIGHT - VIEWPORT_GUTTER),
  )

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Session ${sessionId}`}
      className="session-context-menu fixed z-[9999]"
      style={{ left, top }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          focusMenuItem('next')
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          focusMenuItem('previous')
        } else if (event.key === 'Home') {
          event.preventDefault()
          focusMenuItem('first')
        } else if (event.key === 'End') {
          event.preventDefault()
          focusMenuItem('last')
        } else if (event.key === 'Escape' || event.key === 'Tab') {
          onClose()
        }
      }}
    >
      {tags.length > 0 ? (
        <>
          <div className="session-context-menu__label" role="presentation">
            {t('tags.contextMenu.labels')}
          </div>
          <div className="session-context-menu__tags" role="group" aria-label={t('tags.contextMenu.labels')}>
            {tags.map((tag) => {
              const assigned = sessionTagIds.includes(tag.id)
              const isHex = tag.color.startsWith('#')
              return (
                <button
                  key={tag.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={assigned}
                  className="session-context-menu__item"
                  onClick={() => onToggleTag(tag.id, assigned)}
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${isHex ? '' : getColorClass(tag.color)}`}
                    style={getColorStyle(tag.color)}
                    aria-hidden="true"
                  />
                  <span className="session-context-menu__text">{tag.name}</span>
                  {assigned ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                </button>
              )
            })}
          </div>
          <div className="session-context-menu__separator" role="separator" />
        </>
      ) : null}

      {onOpenTerminal ? (
        <MenuAction
          icon={<Terminal />}
          label={t('tags.contextMenu.openTerminal')}
          onSelect={() => runAndClose(onOpenTerminal)}
        />
      ) : null}
      {onOpenBrowser ? (
        <MenuAction
          icon={<Globe />}
          label={t('tags.contextMenu.openBrowser')}
          onSelect={() => runAndClose(onOpenBrowser)}
        />
      ) : null}
      {onConvert ? (
        <MenuAction
          icon={<ArrowRightLeft />}
          label={t('session.convert.title')}
          onSelect={() => runAndClose(onConvert)}
        />
      ) : null}
      {onToggleFavorite ? (
        <MenuAction
          icon={<Star className={isFavorite ? 'fill-current text-warning' : undefined} />}
          label={t('tags.contextMenu.favorite')}
          onSelect={() => runAndClose(onToggleFavorite)}
        />
      ) : null}

      {pluginActions ? <div className="session-context-menu__plugin-actions" role="presentation">{pluginActions}</div> : null}

      {onCopyResume ? (
        <MenuAction
          icon={<Copy />}
          label={t('tags.contextMenu.copyResume')}
          onSelect={() => runAndClose(onCopyResume)}
        />
      ) : null}
      {onFork ? (
        <MenuAction
          icon={<GitBranch />}
          label={t('tags.contextMenu.fork')}
          onSelect={() => runAndClose(onFork)}
        />
      ) : null}
      {onRename ? (
        <MenuAction
          icon={<Pencil />}
          label={t('tags.contextMenu.rename', { defaultValue: t('common.rename') })}
          onSelect={() => runAndClose(onRename)}
        />
      ) : null}

      {onDelete || onDeleteDirect ? (
        <>
          <div className="session-context-menu__separator" role="separator" />
          {isDeleteConfirming ? (
            <div className="session-context-menu__confirm" role="group" aria-label={t('tags.contextMenu.delete')}>
              <button
                type="button"
                role="menuitem"
                className="session-context-menu__confirm-button"
                onClick={handleDeleteClick}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{t('common.confirm', { defaultValue: 'Confirm?' })}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="session-context-menu__cancel-button"
                onClick={() => {
                  clearConfirmTimeout()
                  setIsDeleteConfirming(false)
                }}
                aria-label={t('common.cancel')}
                title={t('common.cancel')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <MenuAction
              danger
              icon={<Trash2 />}
              label={t('tags.contextMenu.delete')}
              onSelect={handleDeleteClick}
            />
          )}
        </>
      ) : null}
    </div>
  )
}
