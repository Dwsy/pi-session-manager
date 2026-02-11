import { MessageSquare, User, Bot } from 'lucide-react'
import type { SessionStats } from '../../types'

interface MessageDistributionProps {
  stats: SessionStats
  title?: string
}

export default function MessageDistribution({ stats, title = 'Message Distribution' }: MessageDistributionProps) {
  const userPercent = stats.total_messages > 0
    ? (stats.user_messages / stats.total_messages) * 100
    : 0
  const assistantPercent = stats.total_messages > 0
    ? (stats.assistant_messages / stats.total_messages) * 100
    : 0

  const totalMessages = stats.total_messages.toLocaleString()

  return (
    <div className="glass-card rounded-lg p-3 relative overflow-hidden group">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-info/5 via-transparent to-success/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium flex items-center gap-1.5 text-foreground">
            <div className="p-1 rounded bg-info/10">
              <MessageSquare className="h-3 w-3 text-info" />
            </div>
            {title}
          </h3>
          <div className="text-[10px] text-muted-foreground">
            Total: <span className="text-foreground font-medium">{totalMessages}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-background/60 rounded-lg p-2.5 border border-foreground/5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="p-1 bg-info/20 rounded">
                <User className="h-2.5 w-2.5 text-info" />
              </div>
              <span className="text-[10px] text-muted-foreground">User</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-lg font-bold text-gradient">{stats.user_messages.toLocaleString()}</span>
              <span className="text-[10px] text-info">{userPercent.toFixed(0)}%</span>
            </div>
          </div>

          <div className="bg-background/60 rounded-lg p-2.5 border border-foreground/5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="p-1 bg-success/20 rounded">
                <Bot className="h-2.5 w-2.5 text-success" />
              </div>
              <span className="text-[10px] text-muted-foreground">Assistant</span>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-lg font-bold text-gradient">{stats.assistant_messages.toLocaleString()}</span>
              <span className="text-[10px] text-success">{assistantPercent.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <div className="mt-2.5 pt-2.5 border-t border-foreground/5 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Ratio</span>
          <span className="text-xs font-medium text-foreground bg-background/60 px-2 py-0.5 rounded">
            1:{(stats.assistant_messages / Math.max(stats.user_messages, 1)).toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  )
}