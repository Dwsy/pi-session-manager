import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'

interface AppPluginSidebarShellProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  label: string
}

export function AppPluginSidebarShell({ children, className = '', label, ...props }: AppPluginSidebarShellProps) {
  return (
    <section className={`app-plugin-sidebar ${className}`.trim()} aria-label={label} {...props}>
      {children}
    </section>
  )
}

interface AppPluginSidebarHeaderProps {
  actions?: ReactNode
  icon?: ReactNode
  meta?: ReactNode
  subtitle?: ReactNode
  title: ReactNode
}

export function AppPluginSidebarHeader({ actions, icon, meta, subtitle, title }: AppPluginSidebarHeaderProps) {
  return (
    <header className="app-plugin-sidebar__header">
      <div className="app-plugin-sidebar__heading">
        {icon ? <span className="app-plugin-sidebar__icon" aria-hidden="true">{icon}</span> : null}
        <div className="app-plugin-sidebar__title-group">
          <div className="app-plugin-sidebar__title">{title}</div>
          {subtitle ? <div className="app-plugin-sidebar__subtitle">{subtitle}</div> : null}
        </div>
      </div>
      {meta ? <div className="app-plugin-sidebar__meta">{meta}</div> : null}
      {actions ? <div className="app-plugin-sidebar__actions" role="group">{actions}</div> : null}
    </header>
  )
}

export function AppPluginSidebarControls({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`app-plugin-sidebar__controls ${className}`.trim()} {...props}>{children}</div>
}

export const AppPluginSidebarBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function AppPluginSidebarBody({ children, className = '', ...props }, ref) {
    return <div ref={ref} className={`app-plugin-sidebar__body ${className}`.trim()} {...props}>{children}</div>
  },
)

export function AppPluginSidebarFooter({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <footer className={`app-plugin-sidebar__footer ${className}`.trim()} {...props}>{children}</footer>
}

interface AppPluginSidebarStateProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  tone?: 'default' | 'error' | 'warning'
}

export function AppPluginSidebarState({ children, className = '', tone = 'default', ...props }: AppPluginSidebarStateProps) {
  return (
    <div className={`app-plugin-sidebar__state app-plugin-sidebar__state--${tone} ${className}`.trim()} {...props}>
      {children}
    </div>
  )
}

export const appPluginSidebarIconButtonClass = 'app-plugin-sidebar__icon-button'
export const appPluginSidebarActionButtonClass = 'app-plugin-sidebar__action-button'
