import type { Tag } from '../types'

const COLOR_MAP: Record<string, string> = {
  info: 'bg-blue-500',
  success: 'bg-green-500',
  warning: 'bg-orange-500',
  destructive: 'bg-red-500',
  purple: 'bg-purple-500',
  ring: 'bg-cyan-500',
  pink: 'bg-pink-500',
  indigo: 'bg-indigo-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  cyan: 'bg-cyan-500',
  slate: 'bg-slate-500',
}

export function getColorClass(color: string): string {
  return COLOR_MAP[color] || 'bg-blue-500'
}

export function getColorStyle(color: string): React.CSSProperties | undefined {
  if (color.startsWith('#')) return { backgroundColor: color }
  return undefined
}

interface TagBadgeProps {
  tag: Tag
  compact?: boolean
  onRemove?: () => void
}

export default function TagBadge({ tag, compact = true, onRemove }: TagBadgeProps) {
  const isHex = tag.color.startsWith('#')

  if (compact) {
    return (
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full flex-shrink-0 ${isHex ? '' : getColorClass(tag.color)}`}
        style={getColorStyle(tag.color)}
        title={tag.name}
      />
    )
  }

  return (
    <span className="inline-flex items-center gap-1 group">
      <span
        className={`inline-flex items-center px-1.5 py-0 text-[9px] rounded-full text-white leading-relaxed ${isHex ? '' : getColorClass(tag.color)}`}
        style={getColorStyle(tag.color)}
      >
        {tag.name}
      </span>
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="hidden group-hover:inline-flex h-3 w-3 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary text-[8px]"
        >
          &times;
        </button>
      )}
    </span>
  )
}
