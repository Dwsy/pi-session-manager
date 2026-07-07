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
  contentClassName = 'px-3 py-2',
  searchKey,
}: SettingsCardProps) {
  return (
    <div
      className={`rounded-lg border border-border/40 bg-card/20 overflow-hidden ${className}`}
      {...(searchKey ? { 'data-settings-search': searchKey } : {})}
    >
      {(title || description) && (
        <div className="px-3 py-1.5 border-b border-border/40">
          <div className="flex items-start gap-2.5">
            {icon && (
              <span className="mt-0.5 rounded-md bg-secondary/50 p-1 text-muted-foreground [&>svg]:h-3.5 [&>svg]:w-3.5">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && (
                <h4 className="text-sm font-medium text-foreground">{title}</h4>
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
