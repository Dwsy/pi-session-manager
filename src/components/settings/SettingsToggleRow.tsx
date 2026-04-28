import type { ReactNode } from 'react'
import Toggle from '@/components/ui/Toggle'

interface SettingsToggleRowProps {
  title: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
  titleClassName?: string
  descriptionClassName?: string
  contentClassName?: string
  toggleSize?: 'sm' | 'md'
  toggleClassName?: string
  /** Unique key for settings search indexing and scroll targeting */
  searchKey?: string
}

/**
 * Unified toggle-row layout for settings: text on left, toggle on right.
 */
export default function SettingsToggleRow({
  title,
  description,
  checked,
  onChange,
  className = '',
  titleClassName = 'text-sm font-medium text-foreground',
  descriptionClassName = 'text-xs text-muted-foreground',
  contentClassName = 'min-w-0',
  toggleSize = 'md',
  toggleClassName = '',
  searchKey,
}: SettingsToggleRowProps) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${className}`}
      {...(searchKey ? { 'data-settings-search': searchKey } : {})}
    >
      <div className={contentClassName}>
        <div className={titleClassName}>{title}</div>
        {description && <p className={descriptionClassName}>{description}</p>}
      </div>
      <Toggle
        checked={checked}
        onChange={onChange}
        size={toggleSize}
        className={toggleClassName}
      />
    </div>
  )
}
