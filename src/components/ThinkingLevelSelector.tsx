import { useEffect, useMemo, useRef, useState, useCallback, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

interface ThinkingLevelSelectorProps {
  currentLevel: ThinkingLevel | null
  onSelect: (level: ThinkingLevel) => void | Promise<void>
  disabled?: boolean
}

const THINKING_LEVEL_OPTIONS: Array<{ value: ThinkingLevel; label: string }> = [
  { value: 'off', label: '关闭' },
  { value: 'minimal', label: '极低' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' },
]

function getThinkingLevelLabel(level: ThinkingLevel | null): string {
  if (!level) return '思考'
  const matched = THINKING_LEVEL_OPTIONS.find(option => option.value === level)
  return matched ? `思考:${matched.label}` : '思考'
}

export default function ThinkingLevelSelector({
  currentLevel,
  onSelect,
  disabled = false,
}: ThinkingLevelSelectorProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const [openUpward, setOpenUpward] = useState(true)

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger || typeof window === 'undefined') return

    const rect = trigger.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const width = Math.min(180, Math.max(120, rect.width + 16))
    const left = Math.min(Math.max(8, rect.right - width), viewportWidth - width - 8)

    const spaceAbove = Math.max(0, rect.top - 8)
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 8)
    const shouldOpenUpward =
      rect.bottom > viewportHeight * 0.5 ||
      spaceBelow < 160 ||
      spaceAbove > spaceBelow
    const availableHeight = shouldOpenUpward ? spaceAbove : spaceBelow
    const maxHeight = Math.min(availableHeight, 240)
    const top = shouldOpenUpward
      ? Math.max(8, rect.top - maxHeight - 8)
      : Math.min(viewportHeight - maxHeight - 8, rect.bottom + 8)

    setOpenUpward(shouldOpenUpward)
    setMenuStyle({
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.floor(width)}px`,
      maxHeight: `${Math.floor(maxHeight)}px`,
      zIndex: 1300,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (!wrapperRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    updateMenuPosition()
    const handleViewportChange = () => updateMenuPosition()
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open, updateMenuPosition])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const triggerLabel = useMemo(() => getThinkingLevelLabel(currentLevel), [currentLevel])

  const menu = (
    <div
      ref={menuRef}
      className={`thinking-level-menu ${openUpward ? 'upward' : 'downward'}`}
      style={menuStyle}
    >
      {THINKING_LEVEL_OPTIONS.map(option => (
        <button
          key={option.value}
          type="button"
          className={`thinking-level-item ${currentLevel === option.value ? 'active' : ''}`}
          onClick={() => {
            setOpen(false)
            void onSelect(option.value)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="thinking-level-selector" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className="thinking-level-trigger"
        onClick={() => !disabled && setOpen(prev => !prev)}
        disabled={disabled}
      >
        <span className="thinking-level-label">{triggerLabel}</span>
        <ChevronDown size={14} />
      </button>
      {open && typeof document !== 'undefined' ? createPortal(menu, document.body) : null}
    </div>
  )
}
