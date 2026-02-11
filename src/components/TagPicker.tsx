import { useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, Plus, Check } from 'lucide-react'
import type { Tag } from '../types'
import { getColorClass, getColorStyle } from './TagBadge'

interface TagPickerProps {
  tags: Tag[]
  selectedTagIds: string[]
  onToggle: (tagId: string) => void
  onCreateTag?: (name: string, color: string) => void
  anchorRect?: DOMRect | null
  onClose: () => void
}

export default function TagPicker({ tags, selectedTagIds, onToggle, onCreateTag, anchorRect, onClose }: TagPickerProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () => tags.filter(tag => tag.name.toLowerCase().includes(search.toLowerCase())),
    [tags, search],
  )

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const style: React.CSSProperties = anchorRect
    ? { position: 'fixed', top: anchorRect.bottom + 4, left: anchorRect.left, zIndex: 9999 }
    : { zIndex: 9999 }

  return (
    <div ref={ref} style={style} className="w-52 bg-surface border border-border rounded-lg shadow-xl overflow-hidden">
      <div className="p-2 border-b border-border/50">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-background rounded">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('tags.search')}
            className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-1">
        {filtered.map(tag => {
          const selected = selectedTagIds.includes(tag.id)
          const isHex = tag.color.startsWith('#')
          return (
            <button
              key={tag.id}
              onClick={() => onToggle(tag.id)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-secondary transition-colors"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${isHex ? '' : getColorClass(tag.color)}`}
                style={getColorStyle(tag.color)}
              />
              <span className="flex-1 text-xs text-foreground truncate">{tag.name}</span>
              {selected && <Check className="h-3 w-3 text-info" />}
            </button>
          )
        })}
        {filtered.length === 0 && search && onCreateTag && (
          <button
            onClick={() => { onCreateTag(search, 'info'); setSearch('') }}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-secondary"
          >
            <Plus className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('tags.create')}: &quot;{search}&quot;</span>
          </button>
        )}
      </div>
    </div>
  )
}
