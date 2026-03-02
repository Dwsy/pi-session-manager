import type { InputHTMLAttributes } from 'react'

interface SettingsInputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

/**
 * 设置页通用输入框样式。
 */
export default function SettingsInput({ className = '', ...props }: SettingsInputProps) {
  return (
    <input
      className={`w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-info motion-color motion-surface ${className}`}
      {...props}
    />
  )
}
