import type { ReactNode } from 'react'

interface SettingsFieldProps {
  label: ReactNode
  children: ReactNode
  description?: ReactNode
  className?: string
  labelClassName?: string
  descriptionClassName?: string
}

/**
 * 设置页通用字段容器：标题 + 控件 + 可选说明。
 */
export default function SettingsField({
  label,
  children,
  description,
  className = '',
  labelClassName = 'text-sm font-medium text-foreground',
  descriptionClassName = 'text-xs text-muted-foreground',
}: SettingsFieldProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      <div className={labelClassName}>{label}</div>
      {children}
      {description && <p className={descriptionClassName}>{description}</p>}
    </div>
  )
}
