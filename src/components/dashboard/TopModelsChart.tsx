import { Cpu, TrendingUp } from 'lucide-react'
import type { SessionStats } from '../../types'

interface TopModelsChartProps {
  stats: SessionStats
  title?: string
  limit?: number
}

const MODEL_COLORS = [
  '#569cd6', '#7ee787', '#ffa657', '#ff6b6b', '#c792ea',
  '#82aaff', '#89ddff', '#f78c6c', '#ffcb6b', '#c3e88d',
]

export default function TopModelsChart({ stats, title = 'Top Models', limit = 8 }: TopModelsChartProps) {
  const topModels = Object.entries(stats.sessions_by_model)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

  return (
    <div className="bg-[#2c2d3b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2 text-white">
          <Cpu className="h-4 w-4 text-[#6a6f85]" />
          {title}
        </h3>
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3 w-3 text-[#ffa657]" />
          <span className="text-xs text-[#6a6f85]">
            Top {limit} of {Object.keys(stats.sessions_by_model).length} models
          </span>
        </div>
      </div>

      {topModels.length > 0 ? (
        <div className="space-y-3">
          {topModels.map(([name, count], index) => {
            const percent = stats.total_sessions > 0 ? (count / stats.total_sessions) * 100 : 0

            return (
              <div
                key={name}
                className="flex items-center justify-between p-3 bg-[#1a1b26] rounded-lg hover:bg-[#252638] transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length] }}
                  />
                  <span className="text-sm truncate">{name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1.5 bg-[#1e1f2e] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: MODEL_COLORS[index % MODEL_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-xs text-[#6a6f85] w-12 text-right">{count}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-[#6a6f85]">
          <Cpu className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No model data available</p>
        </div>
      )}
    </div>
  )
}