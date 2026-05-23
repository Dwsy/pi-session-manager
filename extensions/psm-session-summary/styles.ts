export const summaryStyles = {
  toolbarButton(hasPayload: boolean) {
    return `inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
      hasPayload
        ? 'border-primary/35 bg-primary/12 text-foreground hover:bg-primary/16'
        : 'border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground'
    }`
  },
  popover: 'absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(440px,calc(100vw-1.25rem))] overflow-hidden rounded-xl border border-border/70 bg-surface-dark/95 shadow-[0_18px_48px_rgba(0,0,0,0.34)] backdrop-blur-xl',
  iconButton: 'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground',
}
