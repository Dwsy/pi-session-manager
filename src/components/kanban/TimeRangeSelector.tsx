import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Clock, Check } from 'lucide-react'
import type { TimeRange } from '@/utils/sessionFilters'

export type { TimeRange }

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (value: TimeRange) => void
  compact?: boolean
}

const TIME_RANGES: TimeRange[] = ['any', '1h', '24h', '2d', '7d', '30d']

export default function TimeRangeSelector({ value, onChange, compact }: TimeRangeSelectorProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; maxHeight: number; origin: 'top' | 'bottom' }>({
    top: 0, left: 0, maxHeight: 300, origin: 'top',
  })

  const labels: Record<TimeRange, string> = {
    any: t('kanban.timeRange.any', 'Any time'),
    '1h': t('kanban.timeRange.1h', 'Last hour'),
    '24h': t('kanban.timeRange.24h', 'Last 24 hours'),
    '2d': t('kanban.timeRange.2d', 'Last 2 days'),
    '7d': t('kanban.timeRange.7d', 'Last 7 days'),
    '30d': t('kanban.timeRange.30d', 'Last 30 days'),
  }

  // Position menu below trigger
  const calcPosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const MENU_ITEM_H = 32
    const menuH = TIME_RANGES.length * MENU_ITEM_H + 8

    if (spaceBelow >= menuH || spaceBelow >= spaceAbove) {
      setMenuPos({
        top: rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - 180),
        maxHeight: Math.min(menuH, spaceBelow - 8),
        origin: 'top',
      })
    } else {
      setMenuPos({
        top: rect.top - 4,
        left: Math.min(rect.left, window.innerWidth - 180),
        maxHeight: Math.min(menuH, spaceAbove - 8),
        origin: 'bottom',
      })
    }
  }, [])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Recalc on open
  useEffect(() => {
    if (open) calcPosition()
  }, [open, calcPosition])

  // Recalc on scroll/resize
  useEffect(() => {
    if (!open) return
    const recalc = () => calcPosition()
    window.addEventListener('scroll', recalc, true)
    window.addEventListener('resize', recalc)
    return () => {
      window.removeEventListener('scroll', recalc, true)
      window.removeEventListener('resize', recalc)
    }
  }, [open, calcPosition])

  const handleSelect = useCallback((range: TimeRange) => {
    onChange(range)
    setOpen(false)
  }, [onChange])

  const displayLabel = compact
    ? labels[value].replace(/Last\s*/i, '').replace(/任意/i, '').trim() || labels[value]
    : labels[value]

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => { calcPosition(); setOpen(o => !o) }}
        className={`flex items-center gap-1 rounded-md border motion-color motion-press focus-ring ${
          compact ? 'h-7 px-2 text-[11px]' : 'h-8 px-2.5 text-[12px]'
        } ${
          open
            ? 'border-primary/50 bg-primary/5 text-foreground'
            : value !== 'any'
              ? 'border-primary/30 bg-primary/5 text-foreground'
              : 'border-border/50 bg-background text-muted-foreground hover:text-foreground hover:border-border'
        }`}
      >
        <Clock className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} shrink-0`} />
        <span className="whitespace-nowrap">{displayLabel}</span>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[9999] min-w-[140px] rounded-lg border border-border/60 bg-popover shadow-lg py-1"
          style={{
            top: menuPos.origin === 'top' ? menuPos.top : undefined,
            bottom: menuPos.origin === 'bottom' ? window.innerHeight - menuPos.top : undefined,
            left: menuPos.left,
            maxHeight: menuPos.maxHeight,
            transformOrigin: menuPos.origin === 'top' ? 'top left' : 'bottom left',
          }}
        >
          {TIME_RANGES.map((range) => (
            <button
              key={range}
              onClick={() => handleSelect(range)}
              className={`flex items-center justify-between w-full px-3 py-1.5 text-[11px] motion-color ${
                range === value
                  ? 'bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <span>{labels[range]}</span>
              {range === value && <Check className="h-3 w-3 text-primary shrink-0" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
