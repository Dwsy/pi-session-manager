import type { ReactNode } from 'react'
import SettingsField from './SettingsField'

interface SettingsSliderFieldProps {
  label: ReactNode
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  valueText?: ReactNode
  description?: ReactNode
  fieldClassName?: string
  labelClassName?: string
  descriptionClassName?: string
  sliderClassName?: string
  valueClassName?: string
  className?: string
}

/**
 * Common slider field for settings: title + range input + right-side value.
 */
export default function SettingsSliderField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  valueText,
  description,
  fieldClassName = 'space-y-2',
  labelClassName,
  descriptionClassName,
  sliderClassName = '',
  valueClassName = '',
  className = '',
}: SettingsSliderFieldProps) {
  return (
    <SettingsField
      label={label}
      description={description}
      className={fieldClassName}
      labelClassName={labelClassName}
      descriptionClassName={descriptionClassName}
    >
      <div className={`flex items-center gap-3 ${className}`}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`flex-1 h-2 bg-secondary rounded-lg appearance-none accent-info ${sliderClassName}`}
        />
        <span className={`text-sm text-muted-foreground text-right ${valueClassName}`}>
          {valueText ?? value}
        </span>
      </div>
    </SettingsField>
  )
}
