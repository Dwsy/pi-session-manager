import type { ReactNode } from 'react'

interface SettingsRadioCardGroupProps<T extends string> {
  options: readonly T[]
  value: T
  onChange: (option: T) => void
  name: string
  getLabel: (option: T) => ReactNode
  getDescription?: (option: T) => ReactNode
  getPrefix?: (option: T, active: boolean) => ReactNode
  getSuffix?: (option: T, active: boolean) => ReactNode
  containerClassName?: string
  itemClassName?: string | ((option: T, active: boolean) => string)
  activeClassName?: string
  inactiveClassName?: string
  radioClassName?: string
  labelClassName?: string
  descriptionClassName?: string
}

/**
 * Common radio-card group for settings: unified card style, selected state, and helper-content layout.
 */
export default function SettingsRadioCardGroup<T extends string>({
  options,
  value,
  onChange,
  name,
  getLabel,
  getDescription,
  getPrefix,
  getSuffix,
  containerClassName = 'space-y-2',
  itemClassName = '',
  activeClassName = 'settings-accent-bg-soft settings-accent-ring border-transparent',
  inactiveClassName = 'border-border hover:border-border-hover',
  radioClassName = 'sr-only',
  labelClassName = 'text-sm font-medium text-foreground',
  descriptionClassName = 'text-xs text-muted-foreground',
}: SettingsRadioCardGroupProps<T>) {
  return (
    <div className={containerClassName}>
      {options.map((option) => {
        const active = value === option
        const className =
          typeof itemClassName === 'function' ? itemClassName(option, active) : itemClassName

        return (
          <label
            key={option}
            className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 motion-color focus-within:ring-2 focus-within:ring-ring/30 ${
              active ? activeClassName : inactiveClassName
            } ${className}`}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={active}
              onChange={() => onChange(option)}
              className={radioClassName}
            />
            {getPrefix?.(option, active)}
            <div className="min-w-0">
              <div className={labelClassName}>{getLabel(option)}</div>
              {getDescription && (
                <div className={descriptionClassName}>{getDescription(option)}</div>
              )}
            </div>
            {getSuffix?.(option, active)}
          </label>
        )
      })}
    </div>
  )
}
