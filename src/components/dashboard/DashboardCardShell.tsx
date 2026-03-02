import type { ReactNode } from 'react'

interface DashboardCardShellProps {
  children: ReactNode
  className?: string
  contentClassName?: string
  overlayClassName?: string
}

function combineClasses(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export default function DashboardCardShell({
  children,
  className,
  contentClassName,
  overlayClassName,
}: DashboardCardShellProps) {
  return (
    <div className={combineClasses('glass-card relative overflow-hidden group', className)}>
      {overlayClassName ? (
        <div
          className={combineClasses(
            'absolute inset-0 opacity-0 group-hover:opacity-100 motion-opacity pointer-events-none',
            overlayClassName,
          )}
        />
      ) : null}
      <div className={combineClasses('relative z-10', contentClassName)}>{children}</div>
    </div>
  )
}
