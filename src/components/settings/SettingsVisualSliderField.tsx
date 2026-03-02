import type { ReactNode } from 'react'
import SettingsField from './SettingsField'

interface SettingsVisualSliderFieldProps {
  label: ReactNode
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  valueText?: ReactNode
  minText?: ReactNode
  maxText?: ReactNode
  description?: ReactNode
  fieldClassName?: string
  labelTextClassName?: string
  valueClassName?: string
  trackClassName?: string
  fillClassName?: string
  thumbClassName?: string
  inputClassName?: string
  tickClassName?: string
}

/**
 * 设置页视觉增强滑块：渐变进度轨道 + 自定义 thumb + 范围刻度。
 */
export default function SettingsVisualSliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  valueText,
  minText,
  maxText,
  description,
  fieldClassName = 'space-y-3',
  labelTextClassName = 'text-xs font-medium text-muted-foreground uppercase tracking-wide',
  valueClassName = 'text-sm font-mono text-info',
  trackClassName = 'h-1.5 rounded-full bg-secondary',
  fillClassName = 'h-1.5 rounded-full bg-gradient-to-r from-info to-info/70',
  thumbClassName = 'w-5 h-5 rounded-full bg-info shadow-[0_0_8px_rgba(86,156,214,0.6)] border-2 border-white/20',
  inputClassName = '',
  tickClassName = 'text-xs text-muted-foreground',
}: SettingsVisualSliderFieldProps) {
  const range = max - min
  const progress = range > 0 ? ((value - min) / range) * 100 : 0
  const clampedProgress = Math.max(0, Math.min(100, progress))

  return (
    <SettingsField
      label={
        <div className="flex items-center justify-between">
          <span className={labelTextClassName}>{label}</span>
          <span className={valueClassName}>{valueText ?? value}</span>
        </div>
      }
      description={description}
      className={fieldClassName}
      labelClassName="block"
    >
      <div className="relative h-6 flex items-center">
        <div className={`absolute inset-x-0 ${trackClassName}`} />
        <div
          className={`absolute ${fillClassName}`}
          style={{ width: `${clampedProgress}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`absolute inset-0 w-full h-full opacity-0 cursor-pointer ${inputClassName}`}
        />
        <div
          className={`absolute pointer-events-none ${thumbClassName}`}
          style={{
            left: `calc(${clampedProgress}% - 10px)`,
            transition:
              'left var(--motion-duration-fast) var(--motion-ease-standard), box-shadow var(--motion-duration-fast) var(--motion-ease-standard)',
          }}
        />
      </div>
      <div className="flex justify-between">
        <span className={tickClassName}>{minText ?? `${min}`}</span>
        <span className={tickClassName}>{maxText ?? `${max}`}</span>
      </div>
    </SettingsField>
  )
}
