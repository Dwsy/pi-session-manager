import { Folder } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SessionStats, SessionInfo } from '../../types'

interface ProjectsChartProps {
  stats: SessionStats
  sessions?: SessionInfo[]
  title?: string
  limit?: number
  onProjectSelect?: (projectPath: string) => void
}

const CHART_COLORS = [
  '#569cd6', '#7ee787', '#ffa657', '#ff6b6b', '#c792ea',
  '#82aaff', '#89ddff', '#f78c6c', '#ffcb6b', '#c3e88d',
]

export default function ProjectsChart({ stats, sessions, title, limit = 8, onProjectSelect }: ProjectsChartProps) {
  const { t } = useTranslation()
  const displayTitle = title || t('dashboard.projectsChart.sessionsByProject')

  // Build a map from project name to full path using sessions data
  const projectPathMap = new Map<string, string>()
  sessions?.forEach(session => {
    if (session.cwd) {
      const projectName = session.cwd.split('/').pop() || session.cwd
      if (!projectPathMap.has(projectName)) {
        projectPathMap.set(projectName, session.cwd)
      }
    }
  })

  const topProjects = Object.entries(stats.sessions_by_project)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

  const handleProjectClick = (projectName: string) => {
    if (onProjectSelect) {
      // Find the full path from sessions
      const fullPath = projectPathMap.get(projectName)
      if (fullPath) {
        onProjectSelect(fullPath)
      }
    }
  }

  return (
    <div className="glass-card rounded-lg p-3 relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-info/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium flex items-center gap-1.5 text-foreground">
            <div className="p-1 rounded bg-info/10">
              <Folder className="h-3 w-3 text-info" />
            </div>
            {displayTitle}
          </h3>
          <div className="text-[10px] text-muted-foreground bg-background/60 px-2 py-0.5 rounded">
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
                className={`flex items-center justify-between p-2 bg-background/60 rounded-lg border border-foreground/5 hover:bg-background/90 hover:border-foreground/10 transition-all duration-300 ${onProjectSelect ? 'cursor-pointer' : ''}`}
                onClick={() => handleProjectClick(project)}
                title={onProjectSelect ? t('dashboard.projectsChart.clickToView', { project }) : undefined}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: color,
                      boxShadow: `0 0 6px ${color}50`
                    }}
                  />
                  <span className="text-xs truncate text-foreground/90 hover:text-foreground transition-colors">{project}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-surface-dark/80 rounded-full overflow-hidden inner-shadow">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-6 text-right">{count}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
