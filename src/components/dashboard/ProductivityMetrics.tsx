import { Target, Clock, Zap, Award, TrendingUp, Calendar } from 'lucide-react'
import type { SessionStats } from '../../types'

interface ProductivityMetricsProps {
  stats: SessionStats
  title?: string
}

export default function ProductivityMetrics({ stats, title = 'Productivity Metrics' }: ProductivityMetricsProps) {
  const avgMessagesPerSession = stats.average_messages_per_session
  const totalSessions = stats.total_sessions
  const totalMessages = stats.total_messages
  const sessionsPerDay = (totalSessions / 30).toFixed(1)

  const peakDay = Object.entries(stats.messages_by_day_of_week)
    .sort((a, b) => b[1] - a[1])[0]

  const peakHour = stats.time_distribution
    .reduce((max, p) => p.message_count > max.message_count ? p : max, stats.time_distribution[0])

  let streak = 0
  for (let i = stats.heatmap_data.length - 1; i >= 0; i--) {
    if (stats.heatmap_data[i].level > 0) {
      streak++
    } else if (streak > 0) {
      break
    }
  }

  const activeDays = stats.heatmap_data.filter(p => p.level > 0).length
  const efficiency = activeDays > 0 ? (totalMessages / activeDays).toFixed(0) : '0'

  const metrics = [
    {
      icon: Target,
      label: 'Avg Messages/Session',
      value: avgMessagesPerSession.toFixed(1),
      color: '#569cd6',
      suffix: ' msgs',
    },
    {
      icon: Clock,
      label: 'Sessions/Day (30d)',
      value: sessionsPerDay,
      color: '#7ee787',
      suffix: '/day',
    },
    {
      icon: Zap,
      label: 'Daily Efficiency',
      value: efficiency,
      color: '#ffa657',
      suffix: ' msgs/day',
    },
    {
      icon: Award,
      label: 'Current Streak',
      value: streak.toString(),
      color: '#ff6b6b',
      suffix: ' days',
    },
    {
      icon: TrendingUp,
      label: 'Total Sessions',
      value: totalSessions.toLocaleString(),
      color: '#c792ea',
      suffix: ' sessions',
    },
    {
      icon: Calendar,
      label: 'Active Days',
      value: activeDays.toLocaleString(),
      color: '#82aaff',
      suffix: ' days',
    },
  ]

  const getStreakColor = (streak: number) => {
    if (streak >= 30) return 'text-[#7ee787]'
    if (streak >= 14) return 'text-[#ffa657]'
    if (streak >= 7) return 'text-[#569cd6]'
    return 'text-[#6a6f85]'
  }

  const getStreakLabel = (streak: number) => {
    if (streak >= 30) return '🔥 Amazing!'
    if (streak >= 14) return '⚡ Great!'
    if (streak >= 7) return '👍 Good'
    if (streak >= 3) return 'Keep going!'
    return 'Start your streak!'
  }

  return (
    <div className="bg-[#2c2d3b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2 text-white">
          <Target className="h-4 w-4 text-[#6a6f85]" />
          {title}
        </h3>
        {streak > 0 && (
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-[#1a1b26] ${getStreakColor(streak)}`}>
            <Award className="h-3 w-3" />
            <span>{getStreakLabel(streak)}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {metrics.map((metric, index) => {
          const Icon = metric.icon
          return (
            <div
              key={index}
              className="bg-[#1a1b26] rounded-lg p-3 hover:bg-[#252638] transition-colors group cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className="h-4 w-4" style={{ color: metric.color }} />
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: metric.color }} />
              </div>
              <div className="text-lg font-bold text-white mb-0.5">{metric.value}</div>
              <div className="text-[10px] text-[#6a6f85] uppercase tracking-wide">
                {metric.label}
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-[#1a1b26]">
        <div className="bg-[#1a1b26] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-3 w-3 text-[#ffa657]" />
            <span className="text-[10px] text-[#6a6f85] uppercase tracking-wide">Peak Day</span>
          </div>
          <div className="text-sm font-medium text-white">{peakDay?.[0] || 'N/A'}</div>
          <div className="text-[10px] text-[#6a6f85]">{peakDay?.[1]?.toLocaleString() || 0} messages</div>
        </div>

        <div className="bg-[#1a1b26] rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-3 w-3 text-[#569cd6]" />
            <span className="text-[10px] text-[#6a6f85] uppercase tracking-wide">Peak Hour</span>
          </div>
          <div className="text-sm font-medium text-white">{peakHour.hour}:00</div>
          <div className="text-[10px] text-[#6a6f85]">{peakHour.message_count} messages</div>
        </div>
      </div>

      {streak > 0 && (
        <div className="mt-4 pt-4 border-t border-[#1a1b26]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[#6a6f85]">Current Streak</span>
            <span className={`text-sm font-bold ${getStreakColor(streak)}`}>{streak} days</span>
          </div>
          <div className="flex gap-0.5">
            {Array.from({ length: Math.min(streak, 30) }).map((_, i) => (
              <div
                key={i}
                className="flex-1 h-2 rounded-sm transition-all hover:scale-y-125"
                style={{
                  backgroundColor: streak >= 30
                    ? '#7ee787'
                    : streak >= 14
                      ? '#ffa657'
                      : streak >= 7
                        ? '#569cd6'
                        : '#6a6f85',
                  opacity: 0.4 + (i / Math.min(streak, 30)) * 0.6,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}