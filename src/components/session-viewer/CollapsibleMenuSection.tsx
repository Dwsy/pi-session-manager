import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

interface CollapsibleMenuSectionProps {
  label: ReactNode
  children: ReactNode
  defaultOpen?: boolean
}

/**
 * Collapsible section header for context menus. Collapsed by default so long
 * tag/status groups don't stretch the menu; click toggles the children.
 */
export default function CollapsibleMenuSection({
  label,
  children,
  defaultOpen = false,
}: CollapsibleMenuSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="session-context-menu__section-toggle"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{label}</span>
        <ChevronRight className="session-context-menu__section-chevron" aria-hidden="true" />
      </button>
      {open ? children : null}
    </>
  )
}
