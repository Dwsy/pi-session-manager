import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  title = 'Active Hours',
  type = 'hourly',
}: TimeDistributionProps) {
  const { t } = useTranslation()
  const renderHourly = () => {
    // Only show hours with activity, max 8 items
    const hourlyData = stats.time_distribution
      .filter(p => p.message_count > 0)
      .sort((a, b) => b.message_count - a.message_count)
      .slice(0, 8)
      .map(p => ({
        hour: HOUR_LABELS[p.hour] || p.hour.toString(),
        value: p.message_count,
        isPeak: false,
      }))

    if (hourlyData.length === 0) {
      return <div className="text-center text-[#6a6f85] py-4 text-xs">{t('components.dashboard.noActivityData')}</div>
    }

    const maxValue = Math.max(...hourlyData.map(d => d.value), 1)
    // Mark top 3 as peak hours
    hourlyData.forEach((item, index) => {
      if (index < 3) item.isPeak = true
    })

    return (
      <div className="space-y-1.5">
        {hourlyData.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="w-6 text-right text-[10px] text-[#6a6f85] font-medium">{item.hour}</div>
            <div className="flex-1 h-4 bg-[#1a1b26]/60 rounded overflow-hidden inner-shadow relative">
              <div
                className={`h-full rounded transition-all duration-500 ${
                  item.isPeak 
                    ? 'bg-gradient-to-r from-[#ffa657] to-[#ff6b6b]' 
                    : 'bg-gradient-to-r from-[#569cd6]/60 to-[#569cd6]'
                }`}
                style={{ 
                  width: `${Math.min((item.value / maxValue) * 100, 100)}%`,
                  boxShadow: item.isPeak ? '0 0 8px rgba(255, 166, 87, 0.4)' : 'none'
                }}
              />
            </div>
            <div className="w-6 text-right text-[10px] text-white font-medium">{item.value}</div>
            {item.isPeak && (
              <div className="text-[8px] text-[#ffa657]">★</div>
            )}
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

    const maxValue = Math.max(...weeklyData.map(d => d.value), 1)

    return (
      <div className="space-y-1.5">
        {weeklyData.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="w-6 text-right text-[10px] text-[#6a6f85]">{item.day}</div>
            <div className="flex-1 h-4 bg-[#1a1b26]/60 rounded overflow-hidden inner-shadow">
              <div
                className="h-full bg-gradient-to-r from-[#7ee787]/60 to-[#7ee787] rounded transition-all duration-500"
                style={{ width: `${Math.min((item.value / maxValue) * 100, 100)}%` }}
              />
            </div>
            <div className="w-6 text-right text-[10px] text-white">{item.value}</div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="glass-card rounded-lg p-3 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-[#ffa657]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium flex items-center gap-1.5 text-white">
            <div className="p-1 rounded bg-[#ffa657]/10">
              <Clock className="h-3 w-3 text-[#ffa657]" />
            </div>
            {title}
          </h3>
        </div>

        <div className="text-[9px] text-[#6a6f85] mb-2 px-1">
          {type === 'hourly' && 'Your most active hours of the day'}
          {type === 'weekly' && 'Your most active days of the week'}
          {type === 'daily' && 'Daily activity distribution'}
        </div>

        {type === 'hourly' && renderHourly()}
        {type === 'weekly' && renderWeekly()}
        {type === 'daily' && <div className="text-center text-[#6a6f85] py-4 text-xs">{t('components.dashboard.dailyViewComingSoon')}</div>}
      </div>
    </div>
  )
}