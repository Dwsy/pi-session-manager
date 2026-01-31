import type { SessionInfo } from '../types'
import { FolderOpen, Loader2, ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'

interface ProjectListProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  selectedProject?: string | null
  onSelectSession: (session: SessionInfo) => void
  onSelectProject?: (project: string | null) => void
  loading: boolean
}

interface Project {
  dir: string
  dirName: string
  sessionCount: number
  messageCount: number
  lastModified: number
}

export default function ProjectList({
  sessions,
  selectedSession,
  selectedProject: externalSelectedProject,
  onSelectSession,
  onSelectProject,
  loading,
}: ProjectListProps) {
  const { t } = useTranslation()
  // Use external selectedProject if provided, otherwise use internal state
  const [internalSelectedProject, setInternalSelectedProject] = useState<string | null>(null)
  const selectedProject = externalSelectedProject !== undefined ? externalSelectedProject : internalSelectedProject
  const setSelectedProject = onSelectProject || setInternalSelectedProject

  const projectMap = sessions.reduce((acc, session) => {
    const cwd = session.cwd || t('common.unknown')
    if (!acc[cwd]) {
      acc[cwd] = []
    }
    acc[cwd].push(session)
    return acc
  }, {} as Record<string, SessionInfo[]>)

  const projects: Project[] = Object.entries(projectMap).map(([dir, dirSessions]) => ({
    dir,
    dirName: getDirectoryName(dir),
    sessionCount: dirSessions.length,
    messageCount: dirSessions.reduce((sum, s) => sum + s.message_count, 0),
    lastModified: Math.max(...dirSessions.map(s => new Date(s.modified).getTime())),
  }))

  projects.sort((a, b) => b.lastModified - a.lastModified)

  const handleBackToProjects = () => {
    setSelectedProject(null)
  }

  const handleSelectProject = (dir: string) => {
    setSelectedProject(dir)
  }

  if (!selectedProject) {
    if (loading) {
      return (
        <div className="p-6 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
          <p className="text-xs">{t('project.list.loading')}</p>
        </div>
      )
    }

    if (projects.length === 0) {
      return (
        <div className="p-6 text-center text-muted-foreground">
          <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">{t('project.list.empty')}</p>
        </div>
      )
    }

    return (
      <div>
        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/30">
          {t('project.list.count', { count: projects.length })}
        </div>
        {projects.map((project) => (
          <div
            key={project.dir}
            onClick={() => handleSelectProject(project.dir)}
            className="px-3 py-2.5 hover:bg-accent cursor-pointer transition-colors border-b border-border/30"
          >
            <div className="flex items-center gap-2.5">
              <FolderOpen className="h-4 w-4 text-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate leading-tight">{project.dirName}</div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                  <span>{project.sessionCount} {t('project.list.sessions')}</span>
                  <span className="text-border">·</span>
                  <span>{project.messageCount} {t('session.list.messages')}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const projectSessions = projectMap[selectedProject] || []
  const projectInfo = projects.find(p => p.dir === selectedProject)

  return (
    <div>
      {/* Header: Back + Project Info Combined */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-background/30">
        <button
          onClick={handleBackToProjects}
          className="p-1 hover:bg-accent rounded transition-colors flex-shrink-0"
          title={t('project.list.back')}
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <FolderOpen className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
          <span className="text-sm font-medium truncate">{projectInfo?.dirName}</span>
          <span className="text-[11px] text-muted-foreground flex-shrink-0">({projectSessions.length})</span>
        </div>
      </div>

      <div className="divide-y divide-border/30">
        {projectSessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session)}
            className={`px-3 py-2 cursor-pointer hover:bg-accent transition-colors group ${
              selectedSession?.id === session.id ? 'bg-accent' : ''
            }`}
          >
            <div className="text-sm truncate leading-tight">
              {session.name || session.first_message || t('session.list.untitled')}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
              <span>{formatShortTime(session.modified)}</span>
              <span className="text-border">·</span>
              <span>{session.message_count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function getDirectoryName(cwd: string): string {
  if (!cwd || cwd === 'Unknown' || cwd === '未知') {
    return cwd || 'Unknown Directory'
  }

  const parts = cwd.split(/[\\/]/)
  const lastPart = parts[parts.length - 1]

  if (lastPart && lastPart.length > 0) {
    return lastPart
  }

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]} / ${parts[parts.length - 1]}`
  }

  return cwd
}

function formatShortTime(date: string): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays < 30) return `${diffDays}天前`
  return `${Math.floor(diffDays / 30)}月前`
}