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
  contentClassName = 'px-4 py-3',
  searchKey,
}: SettingsCardProps) {
  return (
    <div
      className={`overflow-hidden rounded-md border border-border bg-card ${className}`}
      {...(searchKey ? { 'data-settings-search': searchKey } : {})}
    >
      {(title || description) && (
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-start gap-2.5">
            {icon && (
              <span className="mt-0.5 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
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
