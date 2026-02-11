import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Tag, SessionTag } from '../types'
import { getColorClass, getColorStyle } from './TagBadge'

interface TagFilterProps {
  tags: Tag[]
  sessionTags: SessionTag[]
  filterTagIds: string[]
  onFilterChange: (tagIds: string[]) => void
}

export default function TagFilter({ tags, sessionTags, filterTagIds, onFilterChange }: TagFilterProps) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)

  if (tags.length === 0) return null

  const countMap = new Map<string, number>()
  for (const st of sessionTags) {
    countMap.set(st.tagId, (countMap.get(st.tagId) || 0) + 1)
  }

  const handleClick = (tagId: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      // Multi-select toggle
      if (filterTagIds.includes(tagId)) {
        onFilterChange(filterTagIds.filter(id => id !== tagId))
      } else {
        onFilterChange([...filterTagIds, tagId])
      }
    } else {
      // Single select toggle
      if (filterTagIds.length === 1 && filterTagIds[0] === tagId) {
        onFilterChange([])
      } else {
        onFilterChange([tagId])
      }
    }
  }

  return (
    <div className="border-b border-border/50">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full px-3 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {t('tags.filter.title')}
        {filterTagIds.length > 0 && (
          <span className="ml-auto text-[9px] text-info cursor-pointer" onClick={(e) => { e.stopPropagation(); onFilterChange([]) }}>
            {t('tags.filter.clearFilter')}
          </span>
        )}
      </button>
      {!collapsed && (
        <div className="px-2 pb-2 space-y-0.5">
          {tags.map(tag => {
            const active = filterTagIds.includes(tag.id)
            const count = countMap.get(tag.id) || 0
            const isHex = tag.color.startsWith('#')
            return (
              <button
                key={tag.id}
                onClick={(e) => handleClick(tag.id, e)}
                className={`flex items-center gap-2 w-full px-2 py-1 rounded text-left transition-colors ${
                  active ? 'bg-secondary' : 'hover:bg-secondary/50'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full flex-shrink-0 ${isHex ? '' : getColorClass(tag.color)}`}
                  style={getColorStyle(tag.color)}
                />
                <span className={`flex-1 text-[11px] truncate ${active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  {tag.name}
                </span>
                <span className="text-[9px] text-muted-foreground/60 tabular-nums">{count}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
