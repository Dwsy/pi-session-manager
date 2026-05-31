/**
 * Unified toggle switch component
 */

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md'
  label?: string
  className?: string
}

export default function Toggle({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  label,
  className = '',
}: ToggleProps) {
  const isSmall = size === 'sm'

  return (
    <label
      className={`inline-flex items-center gap-3 select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {label && (
        <span className="text-sm font-medium text-foreground">{label}</span>
      )}
      <div className={`relative flex-shrink-0 ${isSmall ? 'w-10 h-5' : 'w-10 h-6'}`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <div
          className={`absolute inset-0 rounded-full motion-color pointer-events-none ${
            checked ? 'settings-accent-bg-strong' : 'bg-secondary'
          }`}
        />
        <div
          className={`absolute w-4 h-4 rounded-full bg-white motion-transform pointer-events-none ${
            isSmall
              ? 'top-0.5 left-0.5 peer-checked:translate-x-5'
              : 'top-1 left-1 peer-checked:translate-x-4'
          }`}
        />
      </div>
    </label>
  )
}
