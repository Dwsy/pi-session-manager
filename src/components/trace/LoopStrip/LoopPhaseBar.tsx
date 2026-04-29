import type { LoopPhases } from './deriveLoops'

const PHASE_COLORS = {
  thinking: '#a78bfa',
  toolCalls: '#eab308',
  response: '#14b8a6',
} as const

interface LoopPhaseBarProps {
  phases: LoopPhases
  durationMs: number
  hasError: boolean
  selected: boolean
  hovered: boolean
}

export default function LoopPhaseBar({ phases, durationMs, hasError, selected, hovered }: LoopPhaseBarProps) {
  if (durationMs <= 0) {
    return (
      <div
        className="w-full h-full rounded-sm"
        style={{
          backgroundColor: 'var(--muted)',
          opacity: 0.3,
        }}
      />
    )
  }

  const total = phases.thinkingMs + phases.toolCallsMs + phases.responseMs
  const scale = total > 0 ? 1 : 0

  const thinkingPct = scale * (phases.thinkingMs / total) * 100
  const toolCallsPct = scale * (phases.toolCallsMs / total) * 100
  const responsePct = scale * (phases.responseMs / total) * 100

  // If no distinct phases, show as single bar
  const hasPhases = thinkingPct > 0 || toolCallsPct > 0

  return (
    <div
      className="w-full h-full rounded-sm overflow-hidden flex transition-all duration-150"
      style={{
        opacity: selected ? 1 : hovered ? 0.9 : 0.75,
        boxShadow: selected
          ? `0 0 0 1.5px var(--accent), 0 0 8px rgba(var(--accent-rgb), 0.25)`
          : hasError
            ? `0 0 0 1px var(--destructive)`
            : 'none',
      }}
    >
      {hasPhases ? (
        <>
          {thinkingPct > 0 && (
            <div
              className="h-full transition-[width] duration-200"
              style={{
                width: `${thinkingPct}%`,
                backgroundColor: PHASE_COLORS.thinking,
                minWidth: thinkingPct > 0 ? 1 : 0,
              }}
            />
          )}
          {toolCallsPct > 0 && (
            <div
              className="h-full transition-[width] duration-200"
              style={{
                width: `${toolCallsPct}%`,
                backgroundColor: PHASE_COLORS.toolCalls,
                minWidth: toolCallsPct > 0 ? 1 : 0,
              }}
            />
          )}
          {responsePct > 0 && (
            <div
              className="h-full transition-[width] duration-200"
              style={{
                width: `${responsePct}%`,
                backgroundColor: PHASE_COLORS.response,
                minWidth: responsePct > 0 ? 1 : 0,
              }}
            />
          )}
        </>
      ) : (
        <div className="w-full h-full" style={{ backgroundColor: PHASE_COLORS.response }} />
      )}
    </div>
  )
}
