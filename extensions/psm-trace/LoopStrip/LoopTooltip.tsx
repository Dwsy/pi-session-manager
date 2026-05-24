import type { AgentLoop } from './deriveLoops'

interface LoopTooltipProps {
  loop: AgentLoop
  position: { x: number; y: number }
  containerWidth: number
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m${s}s`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatCost(n: number): string {
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

export default function LoopTooltip({ loop, position, containerWidth }: LoopTooltipProps) {
  const tooltipWidth = 260
  const padding = 12

  // Clamp position so tooltip stays within container
  let left = position.x
  if (left + tooltipWidth + padding > containerWidth) {
    left = containerWidth - tooltipWidth - padding
  }
  if (left < padding) left = padding

  return (
    <div
      className="absolute z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-100"
      style={{
        left,
        bottom: '100%',
        marginBottom: 8,
        width: tooltipWidth,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="rounded-lg border border-border/70 bg-background/95 backdrop-blur-sm shadow-xl px-3 py-2.5">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-foreground">
            Loop #{loop.index}
          </span>
          <span className="text-[11px] font-mono text-muted-foreground">
            {formatMs(loop.durationMs)}
          </span>
        </div>

        {/* Summary */}
        {loop.summary && (
          <div className="text-[11px] text-muted-foreground mb-2 line-clamp-2 leading-relaxed">
            {loop.summary}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-[10px]">
          {loop.toolCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono">
              ⚙ {loop.toolCount}
            </span>
          )}
          {loop.toolNames.length > 0 && (
            <span className="text-muted-foreground truncate">
              {loop.toolNames.slice(0, 3).join(', ')}
              {loop.toolNames.length > 3 && ` +${loop.toolNames.length - 3}`}
            </span>
          )}
          {loop.hasError && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-mono">
              ⚠ error
            </span>
          )}
        </div>

        {/* Tokens & Cost */}
        {(loop.tokens || loop.cost) && (
          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50 text-[10px] font-mono text-muted-foreground">
            {loop.tokens && (
              <span>{formatTokens(loop.tokens.total)} tok</span>
            )}
            {loop.cost && loop.cost.total > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">
                {formatCost(loop.cost.total)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
