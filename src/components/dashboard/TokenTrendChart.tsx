import { TrendingUp, Zap } from 'lucide-react'
import type { SessionStats } from '../../types'
import { format, parseISO, subDays } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'

interface TokenTrendChartProps {
  stats: SessionStats
  title?: string
  days?: number
}

export default function TokenTrendChart({ stats, title = 'Token Usage Trend', days = 30 }: TokenTrendChartProps) {
  // Generate daily token data from messages_by_date
  const generateDailyTokenData = () => {
    const today = new Date()
    const dailyData: { date: string; tokens: number; cost: number; displayDate: string }[] = []
    
    // Estimate tokens per message (rough average)
    const avgTokensPerMessage = stats.total_messages > 0 
      ? stats.total_tokens / stats.total_messages 
      : 0
    
    const avgCostPerMessage = stats.total_messages > 0
      ? stats.token_details.total_cost / stats.total_messages
      : 0

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(today, i)
      const dateStr = format(date, 'yyyy-MM-dd')
      const messageCount = stats.messages_by_date[dateStr] || 0
      const estimatedTokens = Math.round(messageCount * avgTokensPerMessage)
      const estimatedCost = messageCount * avgCostPerMessage

      dailyData.push({
        date: dateStr,
        displayDate: format(date, 'MMM dd'),
        tokens: estimatedTokens,
        cost: estimatedCost,
      })
    }

    return dailyData
  }

  const dailyData = generateDailyTokenData()
  const maxTokens = Math.max(...dailyData.map(d => d.tokens), 1)
  const totalPeriodTokens = dailyData.reduce((sum, d) => sum + d.tokens, 0)
  const totalPeriodCost = dailyData.reduce((sum, d) => sum + d.cost, 0)

  // Check if there's any data
  const hasData = totalPeriodTokens > 0

  const formatTokens = (count: number) => {
    if (count === 0) return '0'
    if (count < 1000) return count.toString()
    if (count < 1000000) return `${(count / 1000).toFixed(1)}k`
    return `${(count / 1000000).toFixed(2)}M`
  }

  const formatCost = (cost: number) => {
    if (cost === 0) return '$0.00'
    if (cost < 0.01) return `$${cost.toFixed(4)}`
    if (cost < 1) return `$${cost.toFixed(3)}`
    return `$${cost.toFixed(2)}`
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-[#1a1b26] border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
          <div className="text-white font-medium mb-1">
            {data.displayDate}
          </div>
          <div className="text-[#7ee787] flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {formatTokens(data.tokens)}
          </div>
          <div className="text-[#ff6b6b]">
            {formatCost(data.cost)}
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="glass-card rounded-lg p-3 relative overflow-hidden group">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#7ee787]/5 via-transparent to-[#569cd6]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium flex items-center gap-1.5 text-white">
            <div className="p-1 rounded bg-[#7ee787]/10">
              <TrendingUp className="h-3 w-3 text-[#7ee787]" />
            </div>
            {title}
          </h3>
          <div className="flex items-center gap-2 text-[10px]">
            <div className="text-[#6a6f85]">
              {days} days: <span className="text-white font-medium">{formatTokens(totalPeriodTokens)}</span>
            </div>
            <div className="text-[#6a6f85]">
              <span className="text-[#ff6b6b] font-medium">{formatCost(totalPeriodCost)}</span>
            </div>
          </div>
        </div>

        {/* Chart or Empty State */}
        {!hasData ? (
          <div className="h-24 flex items-center justify-center text-[#6a6f85] text-xs">
            <div className="text-center">
              <TrendingUp className="h-6 w-6 mx-auto mb-2 opacity-30" />
              <p>No token usage data available</p>
              <p className="text-[10px] mt-1 opacity-70">Start using sessions to see trends</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chart */}
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <defs>
                    <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7ee787" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#569cd6" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="displayDate" 
                    stroke="#6a6f85"
                    fontSize={9}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    tick={{ fill: '#6a6f85' }}
                  />
                  <YAxis 
                    stroke="#6a6f85"
                    fontSize={9}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatTokens}
                    tick={{ fill: '#6a6f85' }}
                    width={40}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    stroke="#7ee787"
                    strokeWidth={2}
                    fill="url(#tokenGradient)"
                    animationDuration={500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[9px]">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-[#7ee787]" />
                  <span className="text-[#6a6f85]">Token Usage</span>
                </div>
              </div>
              <div className="text-[#6a6f85]">
                Avg: <span className="text-white font-medium">{formatTokens(Math.round(totalPeriodTokens / days))}/day</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
