import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import LabelFilter from './LabelFilter'
import type { Tag, SessionTag } from '../types'

interface SearchFilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  tags: Tag[]
  sessionTags: SessionTag[]
  filterTagIds: string[]
  onFilterChange: (tagIds: string[]) => void
  onCreateTag?: (name: string, color: string, parentId?: string) => void
  getDescendantIds: (tagId: string) => string[]
  placeholder?: string
  compact?: boolean
  className?: string
}

export default function SearchFilterBar({
  searchQuery,
  onSearchChange,
  tags,
  sessionTags,
  filterTagIds,
  onFilterChange,
  onCreateTag,
  getDescendantIds,
  placeholder,
  compact = false,
  className = '',
}: SearchFilterBarProps) {
  const { t } = useTranslation()
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClear = useCallback(() => {
    onSearchChange('')
    inputRef.current?.focus()
  }, [onSearchChange])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+F to focus search when not in an input
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        const active = document.activeElement
        if (active?.tagName !== 'INPUT' && active?.tagName !== 'TEXTAREA') {
          e.preventDefault()
          inputRef.current?.focus()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div
        className={`flex items-center gap-1.5 flex-1 min-w-0 rounded-md transition-colors ${
          compact ? 'px-1.5 py-1' : 'px-2 py-1.5'
        } ${
          focused
            ? 'bg-secondary ring-1 ring-border/60'
            : 'bg-secondary/50 hover:bg-secondary/80'
        }`}
      >
        <Search className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-muted-foreground/50 shrink-0`} />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder || t('common.searchPlaceholder')}
          className={`flex-1 min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/40 ${
            compact ? 'text-[11px]' : 'text-[12px]'
          }`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onSearchChange('')
              inputRef.current?.blur()
            }
          }}
        />
        {searchQuery && (
          <button
            onClick={handleClear}
            className="p-0.5 rounded hover:bg-foreground/10 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <X className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'}`} />
          </button>
        )}
      </div>
      {tags.length > 0 && (
        <LabelFilter
          tags={tags}
          sessionTags={sessionTags}
          filterTagIds={filterTagIds}
          onFilterChange={onFilterChange}
          onCreateTag={onCreateTag}
          getDescendantIds={getDescendantIds}
        />
      )}
    </div>
  )
}
