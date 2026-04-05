import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ListFilter, Check, Plus, X, Search } from 'lucide-react'
import type { Tag as TagType, SessionTag } from '../../types'

const COLOR_CSS: Record<string, string> = {
  info: '#3b82f6', success: '#22c55e', warning: '#f97316', destructive: '#ef4444',
  purple: '#a855f7', pink: '#ec4899', indigo: '#6366f1', amber: '#f59e0b',
  emerald: '#10b981', cyan: '#06b6d4', slate: '#64748b', ring: '#06b6d4',
}

function resolveColor(color: string): string {
  if (color.startsWith('#')) return color
  return COLOR_CSS[color] || '#3b82f6'
}

function LabelIcon({ color, hasChildren }: { color: string; hasChildren?: boolean }) {
  const fill = resolveColor(color)
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" className="shrink-0">
      <circle cx="4" cy="4" r="3.5" fill={fill} />
      {hasChildren && (
        <circle cx="4" cy="4" r="1.2" fill="var(--background, #1a1a2e)" fillOpacity="0.85" />
      )}
    </svg>
  )
}

interface LabelFilterProps {
  tags: TagType[]
  sessionTags: SessionTag[]
  filterTagIds: string[]
  onFilterChange: (tagIds: string[]) => void
  onCreateTag?: (name: string, color: string, parentId?: string) => void
  getDescendantIds: (tagId: string) => string[]
}

type MenuPosition = {
  top: number
  left: number
  maxHeight: number
  transform: string
  transformOrigin: 'top right' | 'bottom right'
}

export default function LabelFilter({
  tags, sessionTags, filterTagIds, onFilterChange, onCreateTag, getDescendantIds,
}: LabelFilterProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const createInputRef = useRef<HTMLInputElement>(null)
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({
    top: 0,
    left: 0,
    maxHeight: 360,
    transform: 'translateY(0)',
    transformOrigin: 'top right',
  })

  const activeCount = filterTagIds.length
  const activeRootTags = useMemo(() => {
    return tags.filter(t => !t.parentId && filterTagIds.includes(t.id))
  }, [tags, filterTagIds])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setFilter('')
        setCreating(false)
        setNewName('')
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setFilter(''); setCreating(false); setNewName('') }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const rafId = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(rafId)
  }, [open])

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const viewportPadding = 8
    const gap = 6
    const menuWidth = menuRef.current?.offsetWidth ??
      Math.min(280, Math.max(180, window.innerWidth - viewportPadding * 2))
    const menuHeight = menuRef.current?.offsetHeight ?? 360
    const triggerRect = trigger.getBoundingClientRect()
    const availableWidth = Math.max(0, window.innerWidth - viewportPadding * 2)
    const boundedMenuWidth = Math.min(menuWidth, availableWidth || menuWidth)
    const spaceBelow = window.innerHeight - triggerRect.bottom - gap - viewportPadding
    const spaceAbove = triggerRect.top - gap - viewportPadding
    const openUpward = spaceBelow < menuHeight && spaceAbove > spaceBelow
    const maxHeight = Math.max(120, Math.floor(openUpward ? spaceAbove : spaceBelow))

    let left = triggerRect.right - boundedMenuWidth
    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - boundedMenuWidth - viewportPadding),
    )

    const top = openUpward ? triggerRect.top - gap : triggerRect.bottom + gap

    setMenuPosition({
      top,
      left,
      maxHeight,
      transform: openUpward ? 'translateY(-100%)' : 'translateY(0)',
      transformOrigin: openUpward ? 'bottom right' : 'top right',
    })
  }, [])

  useEffect(() => {
    if (!open) return

    updateMenuPosition()
    const rafId = requestAnimationFrame(updateMenuPosition)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, updateMenuPosition])

  const countMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const st of sessionTags) {
      map.set(st.tagId, (map.get(st.tagId) || 0) + 1)
    }
    return map
  }, [sessionTags])

  const flatItems = useMemo(() => {
    const result: { tag: TagType; parentPath: string; depth: number }[] = []
    const walk = (parentId: string | null, path: string, depth: number) => {
      const children = tags
        .filter(t => (t.parentId || null) === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
      for (const tag of children) {
        result.push({ tag, parentPath: path, depth })
        walk(tag.id, path ? `${path} / ${tag.name}` : tag.name, depth + 1)
      }
    }
    walk(null, '', 0)
    return result
  }, [tags])

  const statusItems = useMemo(() => flatItems.filter(i => i.tag.isBuiltin), [flatItems])
  const labelItems = useMemo(() => flatItems.filter(i => !i.tag.isBuiltin), [flatItems])

  const filteredStatuses = useMemo(() => {
    if (!filter.trim()) return statusItems
    const q = filter.toLowerCase()
    return statusItems.filter(i => i.tag.name.toLowerCase().includes(q))
  }, [statusItems, filter])

  const filteredLabels = useMemo(() => {
    if (!filter.trim()) return labelItems
    const q = filter.toLowerCase()
    return labelItems.filter(i =>
      i.tag.name.toLowerCase().includes(q) || i.parentPath.toLowerCase().includes(q)
    )
  }, [labelItems, filter])

  const handleToggle = useCallback((tagId: string) => {
    const allIds = [tagId, ...getDescendantIds(tagId)]
    const anyActive = allIds.some(id => filterTagIds.includes(id))
    if (anyActive) {
      onFilterChange(filterTagIds.filter(id => !allIds.includes(id)))
    } else {
      onFilterChange([...new Set([...filterTagIds, ...allIds])])
    }
  }, [filterTagIds, onFilterChange, getDescendantIds])

  if (tags.length === 0 && !onCreateTag) return null

  const renderItem = ({ tag, parentPath, depth }: { tag: TagType; parentPath: string; depth: number }) => {
    const isSelected = filterTagIds.includes(tag.id)
    const hasChildren = tags.some(t => t.parentId === tag.id)
    const descendantIds = getDescendantIds(tag.id)
    const totalCount = (countMap.get(tag.id) || 0) +
      descendantIds.reduce((sum, id) => sum + (countMap.get(id) || 0), 0)

    return (
      <button
        key={tag.id}
        onClick={() => handleToggle(tag.id)}
        className="flex w-full cursor-pointer select-none items-center gap-2.5 rounded-[6px] mx-1 px-2 py-1.5 text-[13px] hover:bg-foreground/[0.05] motion-color motion-press focus-ring"
        style={{ paddingLeft: `${8 + depth * 14}px`, width: 'calc(100% - 8px)' }}
      >
        <LabelIcon color={tag.color} hasChildren={hasChildren} />
        <span className="flex-1 min-w-0 truncate text-left">
          {filter.trim() && parentPath ? (
            <><span className="text-muted-foreground/50">{parentPath} / </span>{tag.name}</>
          ) : tag.name}
        </span>
        {totalCount > 0 && (
          <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0">{totalCount}</span>
        )}
        {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-foreground/60" />}
      </button>
    )
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-[6px] text-[12px] select-none motion-color motion-press focus-ring ${
          activeCount > 0
            ? 'bg-foreground/[0.08] text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]'
        }`}
      >
        <ListFilter className="h-3 w-3" />
        {activeCount > 0 ? (
          <>
            <span className="max-w-[120px] truncate">
              {activeRootTags.length === 1
                ? activeRootTags[0].name
                : `${activeCount} ${t('tags.filter.title')}`}
            </span>
            <span
              className="ml-0.5 p-0.5 rounded hover:bg-foreground/10"
              onClick={(e) => { e.stopPropagation(); onFilterChange([]) }}
            >
              <X className="h-2.5 w-2.5" />
            </span>
          </>
        ) : (
          <span className="hidden">{t('tags.filter.title')}</span>
        )}
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPosition.top,
            left: menuPosition.left,
            maxHeight: menuPosition.maxHeight,
            transform: menuPosition.transform,
            transformOrigin: menuPosition.transformOrigin,
          }}
          className="z-[70] flex w-[280px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-[8px] border border-border/50 bg-popover text-popover-foreground shadow-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
            <span className="text-[13px] font-medium">{t('tags.filter.filterChats')}</span>
            {activeCount > 0 && (
              <button
                onClick={() => { onFilterChange([]); setFilter('') }}
                className="text-[11px] text-muted-foreground hover:text-foreground motion-color motion-press focus-ring"
              >
                {t('tags.filter.clearFilter')}
              </button>
            )}
          </div>

          {/* Search */}
          <div className="border-b border-border/50 px-3 py-2 flex items-center gap-2">
            <Search className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('tags.filter.searchPlaceholder')}
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Grouped list */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Statuses */}
            <div className="py-1">
              <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                {t('tags.filter.statuses')}
              </div>
              {filteredStatuses.length > 0
                ? filteredStatuses.map(renderItem)
                : <div className="px-3 py-1.5 text-[12px] text-muted-foreground/40">{t('tags.empty')}</div>
              }
            </div>
            {/* Labels */}
            <div className="py-1">
              <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                {t('tags.filter.labels')}
              </div>
              {filteredLabels.length > 0 && filteredLabels.map(renderItem)}
              {filteredLabels.length === 0 && !creating && (
                <div className="px-3 py-1.5 text-[12px] text-muted-foreground/40">{t('tags.empty')}</div>
              )}
              {onCreateTag && (
                <div className="mx-1 mt-0.5">
                  {creating ? (
                    <form
                      className="flex items-center gap-1.5 px-2 py-1.5"
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (newName.trim()) {
                          onCreateTag(newName.trim(), 'info')
                          setNewName('')
                          setCreating(false)
                        }
                      }}
                    >
                      <input
                        ref={createInputRef}
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onBlur={() => { if (!newName.trim()) setCreating(false) }}
                        onKeyDown={(e) => { if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                        placeholder={t('tags.namePlaceholder')}
                        className="flex-1 min-w-0 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/50"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={!newName.trim()}
                        className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-30 motion-color motion-press focus-ring"
                      >
                        {t('tags.add')}
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        setCreating(true)
                        setTimeout(() => createInputRef.current?.focus(), 0)
                      }}
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-[6px] text-[12px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] motion-color motion-press focus-ring"
                    >
                      <Plus className="h-3 w-3" />
                      {t('tags.createNew')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
