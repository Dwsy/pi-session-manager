import { useEffect, useRef, useState } from 'react'
import { ArrowUpDown, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionSortBy } from '../types/sessionSort'

interface SessionSortSelectProps {
  value: SessionSortBy
  onChange: (value: SessionSortBy) => void
  className?: string
  compact?: boolean
}

const SORT_OPTIONS: Array<{
  value: SessionSortBy
  labelKey: string
  fallback: string
}> = [
  { value: 'modified', labelKey: 'session.sort.short.modified', fallback: 'Modified' },
  { value: 'created', labelKey: 'session.sort.short.created', fallback: 'Created' },
  { value: 'name', labelKey: 'session.sort.short.name', fallback: 'Name' },
  { value: 'size', labelKey: 'session.sort.short.size', fallback: 'Size' },
]

export default function SessionSortSelect({
  value,
  onChange,
  className = '',
  compact = true,
}: SessionSortSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const currentOption = SORT_OPTIONS.find((option) => option.value === value) ?? SORT_OPTIONS[0]

  useEffect(() => {
    if (!open) {
      return
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center justify-center rounded-md border border-border/60 bg-secondary/40 text-muted-foreground outline-none hover:text-foreground focus:ring-1 focus:ring-border/70 ${compact ? 'h-7 w-7' : 'h-8 w-8'}`}
        aria-label={t('session.sort.label', { defaultValue: 'Sort sessions' })}
        title={`${t('session.sort.label', { defaultValue: 'Sort sessions' })}: ${t(currentOption.labelKey, { defaultValue: currentOption.fallback })}`}
      >
        <ArrowUpDown className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[132px] rounded-md border border-border/60 bg-popover p-1 shadow-lg"
        >
          {SORT_OPTIONS.map((option) => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-[11px] motion-color motion-press focus-ring ${active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`}
              >
                <span>{t(option.labelKey, { defaultValue: option.fallback })}</span>
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            )
          })}
        </div>
      )}
    </label>
  )
}
