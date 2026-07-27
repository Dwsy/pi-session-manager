import type { ReactNode } from 'react'

interface ToolHeaderProps {
  children: ReactNode
  actions?: ReactNode
  className?: string
  expandable: boolean
  expanded: boolean
  onToggle?: () => void
  ariaLabel?: string
}

export default function ToolHeader({
  children,
  actions,
  className = '',
  expandable,
  expanded,
  onToggle,
  ariaLabel,
}: ToolHeaderProps) {
  const stateClass = expandable
    ? expanded
      ? 'tool-header--expanded'
      : 'tool-header--collapsed'
    : 'tool-header--static'

  return (
    <header
      className={`tool-header ${stateClass} ${className}`.trim()}
      data-expandable={expandable || undefined}
      data-expanded={expandable ? expanded : undefined}
    >
      {expandable ? (
        <button
          type="button"
          className="tool-header-toggle select-none"
          aria-expanded={expanded}
          aria-label={ariaLabel}
          onClick={onToggle}
        >
          <span className="tool-header-content">{children}</span>
        </button>
      ) : (
        <span className="tool-header-toggle" role="group" aria-label={ariaLabel}>
          <span className="tool-header-content">{children}</span>
        </span>
      )}
      {actions ? <div className="tool-header-actions" role="group">{actions}</div> : null}
    </header>
  )
}
