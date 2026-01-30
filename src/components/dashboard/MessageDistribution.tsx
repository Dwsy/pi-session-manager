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
    <div className="bg-[#2c2d3b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2 text-white">
          <MessageSquare className="h-4 w-4 text-[#6a6f85]" />
          {title}
        </h3>
        <div className="text-xs text-[#6a6f85]">
          Total: <span className="text-white font-medium">{totalMessages}</span>
        </div>
      </div>

      <div className="relative h-8 bg-[#1a1b26] rounded-lg overflow-hidden mb-4">
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#569cd6] to-[#6bb8ff] transition-all duration-500 flex items-center justify-center"
          style={{ width: `${userPercent}%` }}
        >
          <span className="text-xs font-bold text-white drop-shadow">
            {userPercent.toFixed(1)}%
          </span>
        </div>
        <div
          className="absolute right-0 top-0 h-full bg-gradient-to-r from-[#7ee787] to-[#a3ff9e] transition-all duration-500 flex items-center justify-center"
          style={{ width: `${assistantPercent}%` }}
        >
          <span className="text-xs font-bold text-white drop-shadow">
            {assistantPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#1a1b26] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-[#569cd6]/20 rounded-md">
              <User className="h-3 w-3 text-[#569cd6]" />
            </div>
            <span className="text-xs text-[#6a6f85]">User Messages</span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-xl font-bold text-white">{stats.user_messages.toLocaleString()}</span>
            <span className="text-xs text-[#569cd6]">{userPercent.toFixed(1)}%</span>
          </div>
        </div>

        <div className="bg-[#1a1b26] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-[#7ee787]/20 rounded-md">
              <Bot className="h-3 w-3 text-[#7ee787]" />
            </div>
            <span className="text-xs text-[#6a6f85]">Assistant Messages</span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-xl font-bold text-white">{stats.assistant_messages.toLocaleString()}</span>
            <span className="text-xs text-[#7ee787]">{assistantPercent.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-[#1a1b26] flex items-center justify-between">
        <span className="text-xs text-[#6a6f85]">User/Assistant Ratio</span>
        <span className="text-sm font-medium text-white">
          1 : {(stats.assistant_messages / Math.max(stats.user_messages, 1)).toFixed(2)}
        </span>
      </div>
    </div>
  )
}