import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: ReactNode
  color: string
  change?: string
  trend?: 'up' | 'down' | 'neutral'
  onClick?: () => void
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  color,
  change,
  trend = 'neutral',
  onClick,
}: StatCardProps) {
  const trendClass =
    trend === 'up'
      ? 'text-success'
      : trend === 'down'
        ? 'text-destructive'
        : 'text-muted-foreground'
  const trendMark = trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border/60 bg-background/45">
          <Icon className="h-3.5 w-3.5" style={{ color }} aria-hidden="true" />
        </span>
        {change ? (
          <span className={`text-[10px] tabular-nums ${trendClass}`}>
            {trendMark} {change}
          </span>
        ) : null}
      </div>
      <div className="mt-3 text-xl font-semibold leading-none tabular-nums text-foreground">
        {value}
      </div>
      <div className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
    </>
  )

  const className =
    'w-full rounded-md border border-border/60 bg-card/45 p-3 text-left motion-surface focus-ring'

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} hover:bg-card/70`}>
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}
