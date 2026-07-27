import type { ReactNode } from 'react'

interface DashboardCardShellProps {
  children: ReactNode
  className?: string
  contentClassName?: string
}

function combineClasses(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export default function DashboardCardShell({
  children,
  className,
  contentClassName,
}: DashboardCardShellProps) {
  return (
    <div
      className={combineClasses(
        'group relative overflow-hidden rounded-md border border-border/60 bg-card/45',
        className,
      )}
    >
      <div className={combineClasses('relative', contentClassName)}>
        {children}
      </div>
    </div>
  )
}
