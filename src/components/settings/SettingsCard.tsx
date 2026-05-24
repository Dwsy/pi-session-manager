/**
 * Settings section card container for consistent visual grouping
 */

interface SettingsCardProps {
  title?: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
  /** Unique key for settings search indexing and scroll targeting */
  searchKey?: string
}

export default function SettingsCard({
  title,
  description,
  icon,
  children,
  className = '',
  contentClassName = 'p-4',
  searchKey,
}: SettingsCardProps) {
  return (
    <div
      className={`rounded-2xl border border-border/70 bg-background/45 overflow-hidden shadow-sm ${className}`}
      {...(searchKey ? { 'data-settings-search': searchKey } : {})}
    >
      {(title || description) && (
        <div className="px-4 py-3 border-b border-border/60 bg-surface/35">
          <div className="flex items-start gap-2.5">
            {icon && (
              <span className="mt-0.5 rounded-lg bg-secondary/70 p-1.5 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h4 className="text-sm font-semibold text-foreground">{title}</h4>
              )}
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </div>
  )
}
