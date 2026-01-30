import { Clock } from 'lucide-react'
import type { SessionStats } from '../../types'

interface TimeDistributionProps {
  stats: SessionStats
  title?: string
  type?: 'hourly' | 'daily' | 'weekly'
}

const HOUR_LABELS = [
  '12a', '1a', '2a', '3a', '4a', '5a', '6a',
  '7a', '8a', '9a', '10a', '11a', '12p',
  '1p', '2p', '3p', '4p', '5p', '6p',
  '7p', '8p', '9p', '10p', '11p',
]

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function TimeDistribution({
  stats,
  title = 'Time Distribution',
  type = 'hourly',
}: TimeDistributionProps) {
  const renderHourly = () => {
    const hourlyData = stats.time_distribution.map(p => ({
      hour: HOUR_LABELS[p.hour] || p.hour.toString(),
      value: p.message_count,
    }))

    return (
      <div className="space-y-2">
        {hourlyData.map((item, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="w-8 text-right text-xs text-[#6a6f85]">{item.hour}</div>
            <div className="flex-1 h-6 bg-[#1a1b26] rounded-lg overflow-hidden">
              <div
                className="h-full bg-[#569cd6] rounded-lg transition-all duration-500"
                style={{ width: `${Math.min((item.value / Math.max(...hourlyData.map(d => d.value), 1)) * 100, 100)}%` }}
              />
            </div>
            <div className="w-12 text-right text-xs text-white">{item.value}</div>
          </div>
        ))}
      </div>
    )
  }

  const renderWeekly = () => {
    const weeklyData = DAYS_OF_WEEK.map(day => ({
      day,
      value: stats.messages_by_day_of_week[day] || 0,
    }))

    return (
      <div className="space-y-2">
        {weeklyData.map((item, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="w-8 text-right text-xs text-[#6a6f85]">{item.day}</div>
            <div className="flex-1 h-6 bg-[#1a1b26] rounded-lg overflow-hidden">
              <div
                className="h-full bg-[#7ee787] rounded-lg transition-all duration-500"
                style={{ width: `${Math.min((item.value / Math.max(...weeklyData.map(d => d.value), 1)) * 100, 100)}%` }}
              />
            </div>
            <div className="w-12 text-right text-xs text-white">{item.value}</div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-[#2c2d3b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2 text-white">
          <Clock className="h-4 w-4 text-[#6a6f85]" />
          {title}
        </h3>
      </div>

      {type === 'hourly' && renderHourly()}
      {type === 'weekly' && renderWeekly()}
      {type === 'daily' && <div className="text-center text-[#6a6f85] py-4">Daily view coming soon</div>}
    </div>
  )
}