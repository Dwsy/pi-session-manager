import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useIsMobile } from '../hooks/useIsMobile'

interface KbdTooltipProps {
  shortcut: string
  label?: string
  children: ReactNode
  position?: 'top' | 'bottom'
  delay?: number
}

/**
 * Wraps a button/element and shows a keyboard shortcut tooltip on hover.
 * Hidden on mobile devices.
 */
export default function KbdTooltip({
  shortcut,
  label,
  children,
  position = 'bottom',
  delay = 400,
}: KbdTooltipProps) {
  const isMobile = useIsMobile()
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  if (isMobile) return <>{children}</>

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), delay)
  }
  const hide = () => {
    clearTimeout(timerRef.current)
    setVisible(false)
  }

  // Parse shortcut keys for rendering
  const keys = shortcut.split('+').map(k => {
    const map: Record<string, string> = {
      Cmd: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧',
      '⌘': '⌘', '⌃': '⌃', '⌥': '⌥', '⇧': '⇧',
    }
    return map[k] || k
  })

  const posClass = position === 'top'
    ? 'bottom-full mb-1.5'
    : 'top-full mt-1.5'

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 ${posClass} z-50 pointer-events-none
            flex items-center gap-1 px-1.5 py-0.5 rounded-md
            bg-[var(--bg-subtle)] border border-[var(--borderMuted)]
            shadow-sm whitespace-nowrap text-[11px] text-[var(--muted)]`}
        >
          {label && <span className="mr-0.5">{label}</span>}
          {keys.map((k, i) => (
            <kbd
              key={i}
              className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1
                rounded bg-[var(--body-bg)] border border-[var(--borderMuted)]
                text-[10px] font-mono leading-none text-[var(--text)]"
            >
              {k}
            </kbd>
          ))}
        </div>
      )}
    </div>
  )
}
