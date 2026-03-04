import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpDown, Check, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionSortBy } from '../types/sessionSort'

interface SessionSortSelectProps {
  value: SessionSortBy
  onChange: (value: SessionSortBy) => void
  className?: string
  compact?: boolean
  showValueLabel?: boolean
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
  showValueLabel = true,
}: SessionSortSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const currentOptionIndex = useMemo(() => {
    const index = SORT_OPTIONS.findIndex((option) => option.value === value)
    return index >= 0 ? index : 0
  }, [value])
  const currentOption = SORT_OPTIONS[currentOptionIndex]

  const closeMenu = useCallback(() => {
    setOpen(false)
  }, [])

  const focusOption = (index: number) => {
    const nextIndex = (index + SORT_OPTIONS.length) % SORT_OPTIONS.length
    setHighlightedIndex(nextIndex)
    optionRefs.current[nextIndex]?.focus()
  }

  const handleSelect = useCallback((option: SessionSortBy) => {
    onChange(option)
    setOpen(false)
    triggerRef.current?.focus()
  }, [onChange])

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (
        menuRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return
      }
      closeMenu()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
        triggerRef.current?.focus()
      }
    }

    const handleDismiss = () => closeMenu()

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleDismiss)
    window.addEventListener('scroll', handleDismiss, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleDismiss)
      window.removeEventListener('scroll', handleDismiss, true)
    }
  }, [closeMenu, open])

  useEffect(() => {
    if (!open) {
      return
    }
    setHighlightedIndex(currentOptionIndex)
    requestAnimationFrame(() => {
      optionRefs.current[currentOptionIndex]?.focus()
    })
  }, [open, currentOptionIndex])

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            return
          }

          if (event.key === 'Escape' && open) {
            event.preventDefault()
            closeMenu()
          }
        }}
        className={`inline-flex items-center rounded-md border border-border/60 bg-secondary/40 text-muted-foreground outline-none transition-colors hover:border-border/80 hover:bg-secondary/70 hover:text-foreground focus:ring-1 focus:ring-border/70 ${showValueLabel ? 'gap-1.5' : 'justify-center'} ${showValueLabel ? (compact ? 'h-7 min-w-[98px] px-2 text-[11px]' : 'h-8 min-w-[112px] px-2.5 text-xs') : (compact ? 'h-7 w-7' : 'h-8 w-8')}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('session.sort.label', { defaultValue: 'Sort sessions' })}
        title={`${t('session.sort.label', { defaultValue: 'Sort sessions' })}: ${t(currentOption.labelKey, { defaultValue: currentOption.fallback })}`}
      >
        <ArrowUpDown className={compact ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4 shrink-0'} />
        {showValueLabel && (
          <>
            <span className="max-w-[72px] truncate text-left">
              {t(currentOption.labelKey, { defaultValue: currentOption.fallback })}
            </span>
            <ChevronDown className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} shrink-0 text-muted-foreground/80`} />
          </>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('session.sort.label', { defaultValue: 'Sort sessions' })}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              focusOption(highlightedIndex + 1)
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              focusOption(highlightedIndex - 1)
              return
            }
            if (event.key === 'Home') {
              event.preventDefault()
              focusOption(0)
              return
            }
            if (event.key === 'End') {
              event.preventDefault()
              focusOption(SORT_OPTIONS.length - 1)
              return
            }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              const targetOption = SORT_OPTIONS[highlightedIndex]
              if (targetOption) {
                handleSelect(targetOption.value)
              }
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              closeMenu()
              triggerRef.current?.focus()
            }
          }}
          className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[164px] rounded-lg border border-border/70 bg-popover p-1 shadow-xl"
        >
          <div className="px-2 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/75">
            {t('session.sort.label', { defaultValue: 'Sort sessions' })}
          </div>
          {SORT_OPTIONS.map((option, index) => {
            const active = option.value === value
            const highlighted = highlightedIndex === index
            return (
              <button
                key={option.value}
                ref={(element) => {
                  optionRefs.current[index] = element
                }}
                type="button"
                onClick={() => {
                  handleSelect(option.value)
                }}
                onMouseEnter={() => {
                  setHighlightedIndex(index)
                }}
                role="menuitemradio"
                aria-checked={active}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] motion-color motion-press focus-ring ${active ? 'bg-secondary text-foreground' : highlighted ? 'bg-secondary/60 text-foreground' : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground'}`}
              >
                <span>{t(option.labelKey, { defaultValue: option.fallback })}</span>
                {active && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
