import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface SettingsOptionButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  active: boolean
  children: ReactNode
  activeClassName?: string
  inactiveClassName?: string
}

/**
 * Unified optional button styles for settings: selected/unselected states and motion tokens.
 */
export default function SettingsOptionButton({
  active,
  children,
  className = '',
  activeClassName = 'border-info bg-info/10 text-foreground',
  inactiveClassName = 'border-border text-muted-foreground hover:border-border-hover',
  ...props
}: SettingsOptionButtonProps) {
  return (
    <button
      type="button"
      className={`rounded-lg border text-sm motion-surface motion-color motion-press focus-ring ${
        active ? activeClassName : inactiveClassName
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
