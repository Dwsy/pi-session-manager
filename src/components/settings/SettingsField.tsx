import type { ReactNode } from 'react'

interface SettingsFieldProps {
  label: ReactNode
  children: ReactNode
  description?: ReactNode
  className?: string
  labelClassName?: string
  descriptionClassName?: string
  /** Unique key for settings search indexing and scroll targeting */
  searchKey?: string
}

/**
 * Common field container for settings: title + control + optional description.
 */
export default function SettingsField({
  label,
  children,
  description,
  className = '',
  labelClassName = 'text-sm font-medium text-foreground',
  descriptionClassName = 'text-xs text-muted-foreground',
  searchKey,
}: SettingsFieldProps) {
  return (
    <div
      className={`space-y-3 ${className}`}
      {...(searchKey ? { 'data-settings-search': searchKey } : {})}
    >
      <div className={labelClassName}>{label}</div>
      {children}
      {description && <p className={descriptionClassName}>{description}</p>}
    </div>
  )
}
