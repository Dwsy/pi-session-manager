import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { X } from 'lucide-react'

interface SessionPluginPanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
  label: string
}

export function SessionPluginPanel({ children, className = '', label, ...props }: SessionPluginPanelProps) {
  return (
    <section
      className={`psm-session-plugin-panel ${className}`.trim()}
      aria-label={label}
      data-no-window-drag
      {...props}
    >
      {children}
    </section>
  )
}

interface SessionPluginPanelHeaderProps {
  actions?: ReactNode
  icon?: ReactNode
  meta?: ReactNode
  onClose?: () => void
  closeLabel?: string
  subtitle?: ReactNode
  title: ReactNode
}

export function SessionPluginPanelHeader({
  actions,
  icon,
  meta,
  onClose,
  closeLabel = 'Close panel',
  subtitle,
  title,
}: SessionPluginPanelHeaderProps) {
  return (
    <header className="psm-session-plugin-panel__header">
      <div className="psm-session-plugin-panel__heading">
        {icon ? <span className="psm-session-plugin-panel__icon" aria-hidden="true">{icon}</span> : null}
        <div className="psm-session-plugin-panel__title-group">
          <div className="psm-session-plugin-panel__title">{title}</div>
          {subtitle ? <div className="psm-session-plugin-panel__subtitle">{subtitle}</div> : null}
        </div>
      </div>
      {meta ? <div className="psm-session-plugin-panel__meta">{meta}</div> : null}
      {(actions || onClose) ? (
        <div className="psm-session-plugin-panel__actions">
          {actions}
          {onClose ? (
            <button
              type="button"
              className="psm-session-plugin-panel__icon-button"
              onClick={onClose}
              aria-label={closeLabel}
              title={closeLabel}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}

export const SessionPluginPanelBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function SessionPluginPanelBody({ children, className = '', ...props }, ref) {
    return (
      <div ref={ref} className={`psm-session-plugin-panel__body ${className}`.trim()} {...props}>
        {children}
      </div>
    )
  },
)

export function SessionPluginPanelFooter({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <footer className={`psm-session-plugin-panel__footer ${className}`.trim()} {...props}>
      {children}
    </footer>
  )
}

interface SessionPluginPanelStateProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  tone?: 'default' | 'error' | 'warning'
}

export function SessionPluginPanelState({
  children,
  className = '',
  tone = 'default',
  ...props
}: SessionPluginPanelStateProps) {
  return (
    <div
      className={`psm-session-plugin-panel__state psm-session-plugin-panel__state--${tone} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  )
}

export const sessionPluginPanelIconButtonClass = 'psm-session-plugin-panel__icon-button'
export const sessionPluginPanelActionButtonClass = 'psm-session-plugin-panel__action-button'
