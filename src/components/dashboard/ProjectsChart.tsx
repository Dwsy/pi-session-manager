import { Folder } from 'lucide-react'
import type { SessionStats } from '../../types'

interface ProjectsChartProps {
  stats: SessionStats
  title?: string
  limit?: number
}

const CHART_COLORS = [
  '#569cd6', '#7ee787', '#ffa657', '#ff6b6b', '#c792ea',
  '#82aaff', '#89ddff', '#f78c6c', '#ffcb6b', '#c3e88d',
]

export default function ProjectsChart({ stats, title = 'Sessions by Project', limit = 8 }: ProjectsChartProps) {
  const topProjects = Object.entries(stats.sessions_by_project)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

  return (
    <div className="glass-card rounded-lg p-3 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-[#82aaff]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium flex items-center gap-1.5 text-white">
            <div className="p-1 rounded bg-[#82aaff]/10">
              <Folder className="h-3 w-3 text-[#82aaff]" />
            </div>
            {title}
          </h3>
          <div className="text-[10px] text-[#6a6f85] bg-[#1a1b26]/60 px-2 py-0.5 rounded">
            {topProjects.length} projects
          </div>
        </div>

        <div className="space-y-1.5">
          {topProjects.map(([project, count], index) => {
            const percent = stats.total_sessions > 0 ? (count / stats.total_sessions) * 100 : 0
            const color = CHART_COLORS[index % CHART_COLORS.length]

            return (
              <div
                key={project}
                className="flex items-center justify-between p-2 bg-[#1a1b26]/60 rounded-lg border border-white/5 hover:bg-[#1a1b26]/90 hover:border-white/10 transition-all duration-300"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 6px ${color}50`
                    }}
                  />
                  <span className="text-xs truncate text-white/90">{project}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-[#1e1f2e]/80 rounded-full overflow-hidden inner-shadow">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-[#6a6f85] w-6 text-right">{count}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}