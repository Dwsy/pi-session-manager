/**
 * Pi Live Sessions Panel
 *
 * Shows Pi Agent sessions currently streaming via WebSocket bridge.
 */

import { usePiLive } from '@/hooks/usePiLive'
import { Bot, WifiOff } from 'lucide-react'
import PiLiveSessionCard from './PiLiveSessionCard'

export default function PiLivePanel() {
  const { sessions, isEnabled } = usePiLive()

  if (!isEnabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 text-muted-foreground">
        <WifiOff className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm">Pi Live is disabled</p>
        <p className="text-xs mt-1 opacity-70">Enable in Settings → Pi Live</p>
      </div>
    )
  }

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

      {sessions.map((session) => (
        <PiLiveSessionCard key={session.session_id} session={session} />
      ))}
    </div>
  )
}
