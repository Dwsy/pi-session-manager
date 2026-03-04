import type { ReactNode, SelectHTMLAttributes } from 'react'

interface SettingsSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode
  className?: string
}

/**
 * Common dropdown style for settings pages.
 */
export default function SettingsSelect({
  children,
  className = '',
  ...props
}: SettingsSelectProps) {
  return (
    <select
      className={`w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-info motion-color motion-surface ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}
