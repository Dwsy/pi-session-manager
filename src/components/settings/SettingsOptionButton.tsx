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
  activeClassName = 'border-primary/40 bg-primary/10 text-foreground',
  inactiveClassName = 'border-border text-muted-foreground hover:border-border-hover',
  ...props
}: SettingsOptionButtonProps) {
  return (
    <button
      type="button"
      className={`focus-ring rounded-md border text-sm motion-color ${
        active ? activeClassName : inactiveClassName
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
