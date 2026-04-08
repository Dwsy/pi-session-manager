type SessionBadgeProps =
  | {
      type: 'new' | 'updated'
      className?: string
      label?: never
      tone?: never
    }
  | {
      label: string
      tone?: 'source' | 'neutral'
      className?: string
      type?: never
    }

/**
 * Session status badge component
 * Displays NEW or UPDATED labels
 */
export function SessionBadge(props: SessionBadgeProps) {
  if ('label' in props) {
    const tone = props.tone ?? 'source'
    return (
      <span
        className={`
          inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium
          flex-shrink-0 leading-none border
          ${tone === 'source'
            ? 'border-blue-500/20 bg-blue-500/10 text-blue-500/90'
            : 'border-border/60 bg-muted/30 text-muted-foreground'
          }
          ${props.className ?? ''}
        `}
      >
        {props.label}
      </span>
    )
  }

  const isNew = props.type === 'new'

  return (
    <span
      className={`
        inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase
        flex-shrink-0 leading-none
        ${isNew
          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
        }
        ${props.className ?? ''}
      `}
    >
      {isNew ? 'NEW' : 'UPDATED'}
    </span>
  )
}
