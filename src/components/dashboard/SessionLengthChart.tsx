import { Ruler, BarChart3 } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import type { SessionInfo } from '../../types'

interface SessionLengthChartProps {
  sessions: SessionInfo[]
  title?: string
}

export default function SessionLengthChart({ sessions, title = 'Session Length Distribution' }: SessionLengthChartProps) {
  // Group sessions by message count ranges
  const ranges = [
    { label: '1-10', min: 1, max: 10, color: '#569cd6' },
    { label: '11-25', min: 11, max: 25, color: '#7ee787' },
    { label: '26-50', min: 26, max: 50, color: '#ffa657' },
    { label: '51-100', min: 51, max: 100, color: '#ff6b6b' },
    { label: '101-200', min: 101, max: 200, color: '#c792ea' },
    { label: '200+', min: 201, max: Infinity, color: '#82aaff' },
  ]

  const data = ranges.map(range => {
    const count = sessions.filter(s =>
      s.message_count >= range.min && s.message_count <= range.max
    ).length

    const percent = sessions.length > 0 ? (count / sessions.length) * 100 : 0

    return {
      range: range.label,
      count,
      percent,
      color: range.color,
    }
  })

  const avgLength = sessions.length > 0
    ? sessions.reduce((sum, s) => sum + s.message_count, 0) / sessions.length
    : 0

  const maxLength = Math.max(...sessions.map(s => s.message_count), 0)
  const minLength = Math.min(...sessions.map(s => s.message_count), 0)

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const entry = payload[0].payload
      return (
        <div className="bg-background border border-secondary rounded-lg p-3 shadow-xl">
          <div className="text-xs text-muted-foreground mb-1">{entry.range} messages</div>
          <div className="text-sm font-medium text-foreground mb-1">{entry.count} sessions</div>
          <div className="text-xs text-muted-foreground">{entry.percent.toFixed(1)}% of total</div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="bg-secondary rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2 text-foreground">
          <Ruler className="h-4 w-4 text-muted-foreground" />
          {title}
        </h3>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-background rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-foreground">{avgLength.toFixed(0)}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Length</div>
        </div>
        <div className="bg-background rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-foreground">{minLength}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Min</div>
        </div>
        <div className="bg-background rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-foreground">{maxLength}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Max</div>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full min-w-[200px] min-h-[180px]">
        <ResponsiveContainer width="100%" height={180} minWidth={200} minHeight={180}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3d3d4d" vertical={false} />
            <XAxis
              dataKey="range"
              tick={{ fill: '#6a6f85', fontSize: 10 }}
              axisLine={{ stroke: '#3d3d4d' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#6a6f85', fontSize: 9 }}
              axisLine={{ stroke: '#3d3d4d' }}
              tickLine={false}
              width={30}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" radius={[2, 2, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-background">
        {data.map((entry, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-[10px] text-muted-foreground">
              {entry.range}: {entry.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}