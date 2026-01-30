import { Calendar, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns'
import type { SessionStats } from '../../types'

interface WeeklyComparisonProps {
  stats: SessionStats
  title?: string
}

export default function WeeklyComparison({ stats, title = 'Weekly Comparison' }: WeeklyComparisonProps) {
  // Get current week and previous week data
  const now = new Date()
  const currentWeekStart = startOfWeek(now)
  const currentWeekEnd = endOfWeek(now)
  const previousWeekStart = startOfWeek(subWeeks(now, 1))
  const previousWeekEnd = endOfWeek(subWeeks(now, 1))

  // Calculate messages for current week
  const currentWeekMessages = Object.entries(stats.messages_by_date)
    .filter(([date]) => {
      const d = parseISO(date)
      return d >= currentWeekStart && d <= currentWeekEnd
    })
    .reduce((sum, [, count]) => sum + (count as number), 0)

  // Calculate messages for previous week
  const previousWeekMessages = Object.entries(stats.messages_by_date)
    .filter(([date]) => {
      const d = parseISO(date)
      return d >= previousWeekStart && d <= previousWeekEnd
    })
    .reduce((sum, [, count]) => sum + (count as number), 0)

  // Calculate change
  const change = previousWeekMessages > 0
    ? ((currentWeekMessages - previousWeekMessages) / previousWeekMessages) * 100
    : 0

  const changeDirection = change > 10 ? 'up' : change < -10 ? 'down' : 'neutral'

  const getChangeIcon = () => {
    switch (changeDirection) {
      case 'up':
        return <TrendingUp className="h-4 w-4" />
      case 'down':
        return <TrendingDown className="h-4 w-4" />
      default:
        return <Minus className="h-4 w-4" />
    }
  }

  const getChangeColor = () => {
    switch (changeDirection) {
      case 'up':
        return 'text-[#7ee787] bg-[#7ee787]/10'
      case 'down':
        return 'text-[#ff6b6b] bg-[#ff6b6b]/10'
      default:
        return 'text-[#6a6f85] bg-[#6a6f85]/10'
    }
  }

  // Get daily breakdown for current week
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const currentWeekDays = days.map((day, index) => {
    const date = new Date(currentWeekStart)
    date.setDate(date.getDate() + index)
    const dateStr = format(date, 'yyyy-MM-dd')
    return {
      day,
      date: dateStr,
      messages: stats.messages_by_date[dateStr] || 0,
      isToday: format(date, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd'),
    }
  })

  const maxMessages = Math.max(...currentWeekDays.map(d => d.messages), 1)

  return (
    <div className="bg-[#2c2d3b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2 text-white">
          <Calendar className="h-4 w-4 text-[#6a6f85]" />
          {title}
        </h3>
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${getChangeColor()}`}>
          {getChangeIcon()}
          <span className="font-medium">
            {change > 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
          <span>vs last week</span>
        </div>
      </div>

      {/* Week Overview */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* This Week */}
        <div className="bg-[#1a1b26] rounded-lg p-4">
          <div className="text-[10px] text-[#6a6f85] uppercase tracking-wide mb-1">This Week</div>
          <div className="text-2xl font-bold text-white mb-1">{currentWeekMessages}</div>
          <div className="text-[10px] text-[#6a6f85]">messages</div>
        </div>

        {/* Last Week */}
        <div className="bg-[#1a1b26] rounded-lg p-4">
          <div className="text-[10px] text-[#6a6f85] uppercase tracking-wide mb-1">Last Week</div>
          <div className="text-2xl font-bold text-white mb-1">{previousWeekMessages}</div>
          <div className="text-[10px] text-[#6a6f85]">messages</div>
        </div>
      </div>

      {/* Daily Breakdown */}
      <div className="space-y-2">
        <div className="text-[10px] text-[#6a6f85] uppercase tracking-wide mb-2">Daily Breakdown</div>
        {currentWeekDays.map((dayData) => (
          <div key={dayData.day} className="flex items-center gap-3">
            <div className={`w-8 text-right text-xs ${dayData.isToday ? 'text-[#569cd6] font-bold' : 'text-[#6a6f85]'}`}>
              {dayData.day}
            </div>
            <div className="flex-1 h-6 bg-[#1a1b26] rounded-lg overflow-hidden relative">
              <div
                className={`h-full rounded-lg transition-all duration-500 ${dayData.isToday ? 'bg-[#569cd6]' : 'bg-[#3d3d4d]'}`}
                style={{ width: `${(dayData.messages / maxMessages) * 100}%` }}
              />
              <div className="absolute inset-0 flex items-center px-2">
                <span className={`text-xs font-medium ${dayData.messages > 0 ? 'text-white' : 'text-[#6a6f85]'}`}>
                  {dayData.messages}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Weekly Average */}
      <div className="mt-4 pt-4 border-t border-[#1a1b26] flex items-center justify-between">
        <span className="text-xs text-[#6a6f85]">Weekly Average</span>
        <span className="text-sm font-medium text-white">
          {(currentWeekMessages / 7).toFixed(1)} messages/day
        </span>
      </div>
    </div>
  )
}