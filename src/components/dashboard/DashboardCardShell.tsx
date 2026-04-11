import React, { useState } from 'react'
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
  const [mouseX, setMouseX] = useState(0)
  const [mouseY, setMouseY] = useState(0)

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMouseX(e.clientX - rect.left)
    setMouseY(e.clientY - rect.top)
  }

  return (
    <div
      className={combineClasses('glass-card relative overflow-hidden group', className)}
      onMouseMove={handleMouseMove}
    >
      {overlayClassName ? (
        <div
          className={combineClasses(
            'absolute inset-0 opacity-0 group-hover:opacity-100 motion-opacity pointer-events-none',
            overlayClassName,
          )}
        />
      ) : null}
      <div
        className={combineClasses('relative z-10', contentClassName)}
      >
        {children}
      </div>
      <div
        className="absolute inset-0 pointer-events-none opacity-30 group-hover:opacity-60 transition-opacity duration-300"
        style={{
          background: 'radial-gradient(circle at ' + mouseX + 'px ' + mouseY + 'px, rgba(138, 190, 183, 0.08) 0%, rgba(138, 190, 183, 0) 60%)',
          filter: 'blur(16px)',
        }}
      />
    </div>
  )
}