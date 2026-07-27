import { Loader2 } from 'lucide-react'

/** Centered spinner used after {@link useDelayedLoading} fires (lists, session viewer, etc.). */
export function DelayedLoadingCenter({
  className = 'flex-1 flex items-center justify-center',
}: {
  className?: string
}) {
  return (
    <div className={className} role="status" aria-live="polite">
      <Loader2
        className="h-6 w-6 animate-spin text-muted-foreground"
        aria-hidden="true"
      />
      <span className="sr-only">Loading</span>
    </div>
  )
}

export interface DelayedLoadingOverlayProps {
  message?: string
  /** Outer wrapper, e.g. fixed inset-0 modal backdrop */
  className?: string
}

/** Modal-style delayed loading (stats panel, heatmap day, etc.). */
export function DelayedLoadingOverlay({
  message,
  className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50',
}: DelayedLoadingOverlayProps) {
  return (
    <div className={className} role="status" aria-live="polite">
      <div className="bg-background border border-border rounded-xl p-8">
        <div className="flex flex-col items-center gap-4">
          <Loader2
            className="h-8 w-8 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          {message ? (
            <div className="text-sm text-muted-foreground">{message}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}