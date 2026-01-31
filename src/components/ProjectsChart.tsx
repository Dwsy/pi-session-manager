import { Folder } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionStats } from '../types'

interface ProjectsChartProps {
  stats: SessionStats
  title?: string
  limit?: number
}

const CHART_COLORS = [
  '#569cd6', '#7ee787', '#ffa657', '#ff6b6b', '#c792ea',
  '#82aaff', '#89ddff', '#f78c6c', '#ffcb6b', '#c3e88d',
]

export default function ProjectsChart({ stats, title, limit = 8 }: ProjectsChartProps) {
  const { t } = useTranslation()
  const displayTitle = title || t('dashboard.projectsChart.sessionsByProject')

  const topProjects = Object.entries(stats.sessions_by_project)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

  return (
    <div className="glass-card rounded-xl p-5 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-[#c792ea]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium flex items-center gap-2 text-white">
            <div className="p-1.5 rounded-lg bg-[#c792ea]/10">
              <Folder className="h-4 w-4 text-[#c792ea]" />
            </div>
            {displayTitle}
          </h3>
          <div className="text-xs text-[#6a6f85] bg-[#1a1b26]/60 px-2.5 py-1 rounded-lg">
            <span className="text-white font-medium">{topProjects.length}</span> {t('dashboard.projectsChart.projects')}
          </div>
        </div>

        <div className="space-y-2.5">
          {topProjects.map(([project, count], index) => {
            const percent = stats.total_sessions > 0 ? (count / stats.total_sessions) * 100 : 0
            const color = CHART_COLORS[index % CHART_COLORS.length]

            return (
              <div
                key={project}
                className="flex items-center justify-between p-3 bg-[#1a1b26]/60 rounded-xl border border-white/5 hover:bg-[#1a1b26]/90 hover:border-white/10 transition-all duration-300 group/item cursor-pointer"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform duration-300 group-hover/item:scale-125"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 8px ${color}60`
                    }}
                  />
                  <span className="text-sm truncate text-white/90">{project}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 bg-[#1e1f2e]/80 rounded-full overflow-hidden inner-shadow">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: color,
                        boxShadow: `0 0 8px ${color}40`
                      }}
                    />
                  </div>
                  <span className="text-xs text-[#6a6f85] w-12 text-right font-medium">{count}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}