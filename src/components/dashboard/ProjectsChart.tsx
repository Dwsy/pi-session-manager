import { Activity, Folder, Layers3, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import DashboardCardShell from './DashboardCardShell'
import type { SessionStats, SessionInfo } from '@/types'
import { getPathBasename } from '@/utils/path'

interface ProjectsChartProps {
  stats: SessionStats
  sessions?: SessionInfo[]
  title?: string
  limit?: number
  onProjectSelect?: (projectPath: string) => void
  onProjectInspect?: (projectPath: string) => void
}

export default function ProjectsChart({ stats, sessions = [], title, limit = 8, onProjectSelect, onProjectInspect }: ProjectsChartProps) {
  const { t, i18n } = useTranslation()
  const displayTitle = title || t('dashboard.projectsChart.projectActivityTitle', 'Project activity')
  const projectMap = new Map<string, { path: string; sessions: number; messages: number; live: number; latest: number; models: Set<string> }>()
  for (const session of sessions) {
    if (!session.cwd) continue
    const current = projectMap.get(session.cwd) || { path: session.cwd, sessions: 0, messages: 0, live: 0, latest: 0, models: new Set<string>() }
    current.sessions += 1
    current.messages += session.message_count
    if (session.isLive) current.live += 1
    current.latest = Math.max(current.latest, new Date(session.modified).getTime() || 0)
    for (const model of session.models?.length ? session.models : session.model ? [session.model] : []) current.models.add(model)
    projectMap.set(session.cwd, current)
  }
  const projects = Array.from(projectMap.values())
    .sort((left, right) => right.sessions - left.sessions || right.messages - left.messages || right.latest - left.latest)
    .slice(0, limit)
  const interactive = Boolean(onProjectInspect || onProjectSelect)
  const dateFormatter = new Intl.DateTimeFormat(i18n.language || undefined, { month: 'short', day: 'numeric' })

  const activate = (path: string) => {
    if (onProjectInspect) onProjectInspect(path)
    else onProjectSelect?.(path)
  }

  return (
    <DashboardCardShell className="p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-medium text-foreground"><span className="flex h-5 w-5 items-center justify-center rounded bg-warning/10 text-warning"><Folder className="h-3 w-3" aria-hidden="true" /></span>{displayTitle}</h3>
          <p className="mt-1 text-[9px] text-muted-foreground">{t('dashboard.projectsChart.projectActivityHint', 'Compare session depth, model spread, and recency')}</p>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">{projectMap.size} {t('dashboard.projectsChart.projectsShort', 'projects')}</span>
      </div>

      {projects.length ? (
        <div className="space-y-1.5">
          {projects.map((project, index) => {
            const name = getPathBasename(project.path) || project.path
            const content = (
              <div className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-warning/10 text-[9px] font-semibold tabular-nums text-warning">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground" title={project.path}>{name}</span>
                  <span className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Activity className="h-2.5 w-2.5" aria-hidden="true" />{project.sessions} {t('dashboard.projectsChart.sessionsShort', 'sessions')}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare className="h-2.5 w-2.5" aria-hidden="true" />{project.messages} {t('dashboard.projectsChart.messagesShort', 'messages')}</span>
                    <span className="inline-flex items-center gap-1"><Layers3 className="h-2.5 w-2.5" aria-hidden="true" />{project.models.size || '—'} {t('dashboard.projectsChart.modelsShort', 'models')}</span>
                    <span>{project.latest ? dateFormatter.format(project.latest) : '—'}{project.live ? ` · ${project.live} ${t('dashboard.projectsChart.liveShort', 'live')}` : ''}</span>
                  </span>
                </span>
                <strong className="shrink-0 text-sm tabular-nums text-foreground">{project.sessions}</strong>
              </div>
            )
            return interactive ? (
              <button key={project.path} type="button" onClick={() => activate(project.path)} className="focus-ring w-full rounded border border-border/55 bg-background/40 p-2 text-left hover:border-border hover:bg-muted/25">{content}</button>
            ) : (
              <div key={project.path} className="rounded border border-border/55 bg-background/40 p-2">{content}</div>
            )
          })}
        </div>
      ) : (
        <div className="py-6 text-center text-xs text-muted-foreground">{Object.keys(stats.sessions_by_project).length ? t('dashboard.projectsChart.sessionDetailsUnavailable', 'Project session details are unavailable') : t('dashboard.insight.noProjectData', 'No project data.')}</div>
      )}
    </DashboardCardShell>
  )
}
