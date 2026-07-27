import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: ReactNode
  color?: string
  tone?: 'info' | 'success' | 'warning' | 'purple' | 'destructive'
  change?: string
  trend?: 'up' | 'down' | 'neutral'
  hint?: ReactNode
  onClick?: () => void
}

const TONE_CLASSES = {
  info: 'text-info bg-info/10',
  success: 'text-success bg-success/10',
  warning: 'text-warning bg-warning/10',
  purple: 'text-purple bg-purple/10',
  destructive: 'text-destructive bg-destructive/10',
} as const

export default function StatCard({
  icon: Icon,
  label,
  value,
  color,
  tone = 'info',
  change,
  trend = 'neutral',
  hint,
  onClick,
}: StatCardProps) {
  const trendClass =
    trend === 'up'
      ? 'text-success'
      : trend === 'down'
        ? 'text-destructive'
        : 'text-muted-foreground'
  const trendMark = trend === 'up' ? '↑' : trend === 'down' ? '↓' : ''
  const toneClasses = TONE_CLASSES[tone]

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border border-current/15 ${toneClasses}`}>
          <Icon className="h-3.5 w-3.5" style={color ? { color } : undefined} aria-hidden="true" />
        </span>
        {change ? (
          <span className={`text-[10px] tabular-nums ${trendClass}`}>
            {trendMark ? `${trendMark} ` : ''}{change}
          </span>
        ) : null}
      </div>
      <div className="mt-2.5 text-xl font-semibold leading-none tabular-nums text-foreground">
        {value}
      </div>
      <div className="mt-1.5 text-[10px] font-medium text-muted-foreground">
        {label}
      </div>
      {hint ? (
        <div className="mt-1 min-h-4 text-[9px] leading-4 text-muted-foreground/80">
          {hint}
        </div>
      ) : null}
    </>
  )

  const className =
    'w-full rounded-md border border-border/60 bg-card/45 p-3 text-left motion-surface focus-ring'

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} hover:border-border hover:bg-card/70`}>
        {content}
      </button>
    )
  }

  return <div className={className}>{content}</div>
}
