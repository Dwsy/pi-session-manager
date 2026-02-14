/**
 * 设置区块卡片容器，统一视觉分组
 */

interface SettingsCardProps {
  title?: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export default function SettingsCard({
  title,
  description,
  icon,
  children,
  className = '',
}: SettingsCardProps) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface/50 overflow-hidden ${className}`}
    >
      {(title || description) && (
        <div className="px-4 py-3 border-b border-border/60 bg-background/40">
          <div className="flex items-center gap-2">
            {icon && (
              <span className="text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
                {icon}
              </span>
            )}
            <div>
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
      <div className="p-4">{children}</div>
    </div>
  )
}
