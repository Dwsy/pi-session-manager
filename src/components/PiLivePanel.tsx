/**
 * Pi Live Sessions Panel
 *
 * Shows Pi Agent sessions currently streaming via WebSocket bridge.
 * State is managed by Rust backend, frontend just queries and displays.
 */

import { usePiLiveSessions } from '../hooks/usePiLiveSessions'
import { Bot, Circle, CircleDot, WifiOff } from 'lucide-react'

export default function PiLivePanel() {
  const { sessions } = usePiLiveSessions()

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground">
        <WifiOff className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">No live Pi sessions</p>
        <p className="text-xs mt-1 opacity-70">Start a Pi session to see it here</p>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center gap-2 px-1 mb-1">
        <Bot className="w-4 h-4 text-amber-500" />
        <span className="text-xs font-medium text-muted-foreground">
          {sessions.length} Active
        </span>
      </div>

      {sessions.map((s) => (
        <div key={s.session_id} className="rounded-lg border border-border/60 bg-surface p-2.5 hover:bg-secondary/50 transition-colors">
          <div className="flex items-center gap-2 mb-1">
            {s.is_streaming
              ? <CircleDot className="w-3 h-3 text-green-500 animate-pulse" />
              : <Circle className="w-3 h-3 text-muted-foreground/50" />
            }
            <span className="text-sm font-medium truncate">{s.session_id}</span>
            {s.is_streaming && (
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-500 font-medium">Live</span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground/80 space-y-0.5">
            {s.pid && <div>PID: {s.pid}</div>}
            {s.cwd && <div className="truncate" title={s.cwd}>{s.cwd.split('/').pop()}</div>}
            {s.entry_count > 0 && <div>{s.entry_count} entries</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
