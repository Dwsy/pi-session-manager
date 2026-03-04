interface SessionBadgeProps {
  type: 'new' | 'updated'
  className?: string
}

/**
 * Session status badge component
 * Displays NEW or UPDATED labels
 */
export function SessionBadge({ type, className = '' }: SessionBadgeProps) {
  const isNew = type === 'new'

  return (
    <span
      className={`
        inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase
        flex-shrink-0 leading-none
        ${isNew
          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
        }
        ${className}
      `}
    >
      {isNew ? 'NEW' : 'UPDATED'}
    </span>
  )
}
