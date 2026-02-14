/**
 * 统一的开关切换组件
 */

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  className?: string
}

export default function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
  className = '',
}: ToggleProps) {
  return (
    <label
      className={`inline-flex items-center gap-3 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {label && (
        <span className="text-sm font-medium text-foreground">{label}</span>
      )}
      <div className="relative w-10 h-6 flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <div className="absolute inset-0 w-10 h-6 rounded-full bg-secondary peer-checked:bg-info peer-checked:shadow-[0_0_12px_rgba(var(--info-rgb),0.35)] transition-all duration-200 pointer-events-none" />
        <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-200 peer-checked:left-5 pointer-events-none" />
      </div>
    </label>
  )
}
