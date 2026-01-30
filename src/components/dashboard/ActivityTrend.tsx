import { Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { SessionStats } from '../../types'

interface ActivityTrendProps {
  stats: SessionStats
  title?: string
  days?: number
  type?: 'line' | 'area'
}

export default function ActivityTrend({
  stats,
  title = 'Activity Trend',
  days = 30,
  type = 'area',
}: ActivityTrendProps) {
  const trendData = stats.heatmap_data
    .filter(p => p.level > 0)
    .slice(-days)
    .map(p => ({
      date: format(parseISO(p.date), 'MM/dd'),
      fullDate: p.date,
      value: p.level * 10,
    }))

  const recentData = trendData.slice(-7)
  const previousData = trendData.slice(-14, -7)

  const recentAvg = recentData.length > 0
    ? recentData.reduce((sum, d) => sum + d.value, 0) / recentData.length
    : 0

  const previousAvg = previousData.length > 0
    ? previousData.reduce((sum, d) => sum + d.value, 0) / previousData.length
    : 0

  const trendPercent = previousAvg > 0
    ? ((recentAvg - previousAvg) / previousAvg) * 100
    : 0

  const trendDirection = trendPercent > 5 ? 'up' : trendPercent < -5 ? 'down' : 'neutral'

  const getTrendIcon = () => {
    switch (trendDirection) {
      case 'up':
        return <TrendingUp className="h-3 w-3" />
      case 'down':
        return <TrendingDown className="h-3 w-3" />
      default:
        return <Minus className="h-3 w-3" />
    }
  }

  const getTrendColor = () => {
    switch (trendDirection) {
      case 'up':
        return 'text-[#7ee787]'
      case 'down':
        return 'text-[#ff6b6b]'
      default:
        return 'text-[#6a6f85]'
    }
  }

  const maxValue = Math.max(...trendData.map(d => d.value), 1)

  return (
    <div className="bg-[#2c2d3b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2 text-white">
          <Activity className="h-4 w-4 text-[#6a6f85]" />
          {title}
        </h3>
        <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-[#1a1b26] ${getTrendColor()}`}>
          {getTrendIcon()}
          <span>{trendPercent > 0 ? '+' : ''}{trendPercent.toFixed(1)}%</span>
          <span className="text-[#6a6f85]">vs last week</span>
        </div>
      </div>

      <div className="space-y-2">
        {trendData.map((item, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="w-12 text-right text-xs text-[#6a6f85]">{item.date}</div>
            <div className="flex-1 h-6 bg-[#1a1b26] rounded-lg overflow-hidden">
              <div
                className={`h-full rounded-lg transition-all duration-500 ${type === 'area' ? 'bg-gradient-to-r from-[#569cd6]/50 to-[#569cd6]' : 'bg-[#569cd6]'}`}
                style={{ width: `${(item.value / maxValue) * 100}%` }}
              />
            </div>
            <div className="w-12 text-right text-xs text-white">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[#1a1b26]">
        <div className="text-center">
          <div className="text-lg font-bold text-white">{trendData.length}</div>
          <div className="text-[10px] text-[#6a6f85] uppercase tracking-wide">Active Days</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-white">
            {trendData.reduce((sum, d) => sum + d.value, 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-[#6a6f85] uppercase tracking-wide">Total Messages</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-white">
            {trendData.length > 0 ? (trendData.reduce((sum, d) => sum + d.value, 0) / trendData.length).toFixed(0) : 0}
          </div>
          <div className="text-[10px] text-[#6a6f85] uppercase tracking-wide">Avg/Day</div>
        </div>
      </div>
    </div>
  )
}