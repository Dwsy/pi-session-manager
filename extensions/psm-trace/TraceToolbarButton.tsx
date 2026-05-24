import { Workflow } from 'lucide-react'
import type { PsmPluginI18nClient } from '@pi-session-manager/plugin-sdk'

interface TraceToolbarButtonProps {
  i18n: PsmPluginI18nClient
  open: boolean
  onToggle: () => void
}

export default function TraceToolbarButton({ i18n, open, onToggle }: TraceToolbarButtonProps) {
  const label = i18n.t('trace.toggle', 'Trace mode')

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`p-1.5 text-xs rounded border transition-colors ${
        open
          ? 'border-primary/40 bg-primary/14 text-primary'
          : 'border-border/70 bg-secondary hover:bg-secondary-hover text-muted-foreground hover:text-foreground'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={open}
    >
      <Workflow className="h-3.5 w-3.5" />
    </button>
  )
}
