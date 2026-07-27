import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'

interface DashboardDialogProps {
  open: boolean
  title: ReactNode
  subtitle?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  ariaLabel?: string
  className?: string
  bodyClassName?: string
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden'))
}

export default function DashboardDialog({
  open,
  title,
  subtitle,
  eyebrow,
  actions,
  children,
  footer,
  onClose,
  ariaLabel,
  className = '',
  bodyClassName = '',
}: DashboardDialogProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => dialogRef.current?.focus())

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const elements = focusableElements(dialogRef.current)
      if (elements.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="dashboard-dialog-backdrop fixed inset-0 z-[560] flex items-center justify-center bg-background/80 p-2 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : titleId}
        tabIndex={-1}
        className={`dashboard-dialog flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-md border border-border bg-background shadow-xl outline-none ${className}`}
      >
        <header className="dashboard-dialog__header flex min-h-14 shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {eyebrow ? <div className="mb-1 text-[10px] font-medium text-muted-foreground">{eyebrow}</div> : null}
            <h2 id={titleId} className="truncate text-base font-semibold text-foreground">{title}</h2>
            {subtitle ? <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={onClose}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-label={t('common.close', 'Close')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className={`dashboard-dialog__body min-h-0 flex-1 overflow-y-auto p-4 ${bodyClassName}`}>
          {children}
        </div>
        {footer ? (
          <footer className="dashboard-dialog__footer shrink-0 border-t border-border bg-muted/10 px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
