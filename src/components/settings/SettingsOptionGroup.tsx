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
 * 设置页通用选项按钮组：统一映射与选中状态逻辑。
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
