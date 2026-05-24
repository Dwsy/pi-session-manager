export const sideChatStyles = {
  toolbarButton(open: boolean) {
    return `inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
      open
        ? 'border-primary/35 bg-primary/12 text-foreground hover:bg-primary/16'
        : 'border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground'
    }`
  },
  panel: 'hidden h-full min-h-0 shrink-0 border-l border-border/70 bg-surface-dark/82 xl:flex xl:flex-col',
  resizeHandle(active: boolean) {
    return `absolute -left-[3px] top-0 h-full w-[6px] cursor-ew-resize ${active ? 'bg-info/40' : 'hover:bg-info/20'}`
  },
  iconButton: 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45',
}
