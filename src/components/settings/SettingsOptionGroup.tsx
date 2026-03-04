import type { ReactNode } from 'react'
import SettingsOptionButton from './SettingsOptionButton'

interface SettingsOptionGroupProps<T extends string> {
  options: readonly T[]
  value: T
  onChange: (option: T) => void
  renderLabel: (option: T) => ReactNode
  containerClassName?: string
  optionClassName?: string | ((option: T) => string)
  activeClassName?: string
  inactiveClassName?: string
}

/**
 * Common option-button group for settings: unified mapping and selection logic.
 */
export default function SettingsOptionGroup<T extends string>({
  options,
  value,
  onChange,
  renderLabel,
  containerClassName = 'flex gap-2',
  optionClassName = '',
  activeClassName,
  inactiveClassName,
}: SettingsOptionGroupProps<T>) {
  return (
    <div className={containerClassName}>
      {options.map((option) => {
        const className =
          typeof optionClassName === 'function' ? optionClassName(option) : optionClassName

        return (
          <SettingsOptionButton
            key={option}
            onClick={() => onChange(option)}
            active={value === option}
            className={className}
            activeClassName={activeClassName}
            inactiveClassName={inactiveClassName}
          >
            {renderLabel(option)}
          </SettingsOptionButton>
        )
      })}
    </div>
  )
}
