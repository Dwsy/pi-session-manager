/**
 * Pi Live Session Card - 显示单个会话信息
 */

import { Circle, CircleDot, Cpu, Brain, HardDrive } from 'lucide-react'
import type { PiLiveSession } from '@/types/pi-live'
import { usePiLive } from '@/hooks/usePiLive'

interface PiLiveSessionCardProps {
  session: PiLiveSession
}

export default function PiLiveSessionCard({ session }: PiLiveSessionCardProps) {
  const { settings } = usePiLive()

  const shortId = session.session_id.match(/[0-9a-f]{8}-[0-9a-f]{4}/i)?.[0] || session.session_id.slice(0, 8)
  const cwdName = session.cwd?.split('/').pop() || session.cwd

  return (
    <div className="rounded-lg border border-border/60 bg-surface p-2.5 hover:bg-secondary/50 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        {session.is_streaming
          ? <CircleDot className="w-3 h-3 text-green-500 animate-pulse" />
          : <Circle className="w-3 h-3 text-muted-foreground/50" />
        }
        <span className="text-sm font-medium truncate">{shortId}</span>
        {session.is_streaming && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-500 font-medium">Live</span>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground/80 space-y-0.5">
        {session.pid && <div>PID: {session.pid}</div>}
        {cwdName && <div className="truncate" title={session.cwd}>{cwdName}</div>}
        {session.entry_count > 0 && <div>{session.entry_count} entries</div>}

        {/* Model info */}
        {settings.showModelInfo && session.model && (
          <div className="flex items-center gap-1 mt-1">
            <Cpu className="w-3 h-3 text-muted-foreground/60" />
            <span className="truncate">{session.model.provider}/{session.model.id}</span>
          </div>
        )}

        {/* Thinking level */}
        {settings.showThinkingLevel && session.thinking_level && (
          <div className="flex items-center gap-1">
            <Brain className="w-3 h-3 text-muted-foreground/60" />
            <span>{session.thinking_level}</span>
          </div>
        )}

        {/* Context usage */}
        {session.context_usage && (
          <div className="flex items-center gap-1">
            <HardDrive className="w-3 h-3 text-muted-foreground/60" />
            <span>{session.context_usage.used?.toLocaleString()}/{session.context_usage.limit?.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}
