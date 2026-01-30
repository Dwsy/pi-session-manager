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
    <div className="bg-[#2c2d3b] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium flex items-center gap-2 text-white">
          <Folder className="h-4 w-4 text-[#6a6f85]" />
          {title}
        </h3>
        <div className="text-xs text-[#6a6f85]">
          <span className="text-white font-medium">{topProjects.length}</span> projects
        </div>
      </div>

      <div className="space-y-3">
        {topProjects.map(([project, count], index) => {
          const percent = stats.total_sessions > 0 ? (count / stats.total_sessions) * 100 : 0

          return (
            <div
              key={project}
              className="flex items-center justify-between p-3 bg-[#1a1b26] rounded-lg hover:bg-[#252638] transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                />
                <span className="text-sm truncate">{project}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-24 h-1.5 bg-[#1e1f2e] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${percent}%`,
                      backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                    }}
                  />
                </div>
                <span className="text-xs text-[#6a6f85] w-12 text-right">{count}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}