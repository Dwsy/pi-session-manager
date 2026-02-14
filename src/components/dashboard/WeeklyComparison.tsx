import { Calendar, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns'
import type { SessionStats } from '../../types'

interface WeeklyComparisonProps {
  stats: SessionStats
  title?: string
}

export default function WeeklyComparison({ stats, title }: WeeklyComparisonProps) {
  const { t } = useTranslation()
  const displayTitle = title || t('dashboard.weeklyComparison.title')
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
        return 'text-success bg-success/10'
      case 'down':
        return 'text-destructive bg-destructive/10'
      default:
        return 'text-muted-foreground bg-muted-foreground/10'
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
    <div className="bg-secondary rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2 text-foreground">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          {displayTitle}
        </h3>
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${getChangeColor()}`}>
          {getChangeIcon()}
          <span className="font-medium">
            {change > 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
          <span>{t('dashboard.weeklyComparison.vsLastWeek')}</span>
        </div>
      </div>

      {/* Week Overview */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* This Week */}
        <div className="bg-background rounded-lg p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">This Week</div>
          <div className="text-2xl font-bold text-foreground mb-1">{currentWeekMessages}</div>
          <div className="text-[10px] text-muted-foreground">messages</div>
        </div>

        {/* Last Week */}
        <div className="bg-background rounded-lg p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Last Week</div>
          <div className="text-2xl font-bold text-foreground mb-1">{previousWeekMessages}</div>
          <div className="text-[10px] text-muted-foreground">messages</div>
        </div>
      </div>

      {/* Daily Breakdown */}
      <div className="space-y-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Daily Breakdown</div>
        {currentWeekDays.map((dayData) => (
          <div key={dayData.day} className="flex items-center gap-3">
            <div className={`w-8 text-right text-xs ${dayData.isToday ? 'text-info font-bold' : 'text-muted-foreground'}`}>
              {dayData.day}
            </div>
            <div className="flex-1 h-6 bg-background rounded-lg overflow-hidden relative">
              <div
                className={`h-full rounded-lg transition-all duration-500 ${dayData.isToday ? 'bg-info' : 'bg-secondary'}`}
                style={{ width: `${(dayData.messages / maxMessages) * 100}%` }}
              />
              <div className="absolute inset-0 flex items-center px-2">
                <span className={`text-xs font-medium ${dayData.messages > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {dayData.messages}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Weekly Average */}
      <div className="mt-4 pt-4 border-t border-background flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Weekly Average</span>
        <span className="text-sm font-medium text-foreground">
          {(currentWeekMessages / 7).toFixed(1)} messages/day
        </span>
      </div>
    </div>
  )
}