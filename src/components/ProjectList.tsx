import type { SessionInfo } from '../types'
import { FolderOpen, Calendar, FileText, Loader2, ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'

interface ProjectListProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  onSelectSession: (session: SessionInfo) => void
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
  onSelectSession,
  loading,
}: ProjectListProps) {
  const { t } = useTranslation()
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  // Group sessions by directory
  const projectMap = sessions.reduce((acc, session) => {
    const cwd = session.cwd || t('common.unknown')
    if (!acc[cwd]) {
      acc[cwd] = []
    }
    acc[cwd].push(session)
    return acc
  }, {} as Record<string, SessionInfo[]>)

  // Calculate project stats
  const projects: Project[] = Object.entries(projectMap).map(([dir, dirSessions]) => ({
    dir,
    dirName: getDirectoryName(dir),
    sessionCount: dirSessions.length,
    messageCount: dirSessions.reduce((sum, s) => sum + s.message_count, 0),
    lastModified: Math.max(...dirSessions.map(s => new Date(s.modified).getTime())),
  }))

  // Sort by last modified
  projects.sort((a, b) => b.lastModified - a.lastModified)

  const handleBackToProjects = () => {
    setSelectedProject(null)
  }

  const handleSelectProject = (dir: string) => {
    setSelectedProject(dir)
  }

  // Show project list
  if (!selectedProject) {
    if (loading) {
      return (
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
          <p className="text-sm">{t('project.loading')}</p>
        </div>
      )
    }

    if (projects.length === 0) {
      return (
        <div className="p-8 text-center text-muted-foreground">
          <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">{t('project.noProjects')}</p>
        </div>
      )
    }

    return (
      <div>
        <div className="px-4 py-3 text-xs text-muted-foreground">
          {projects.length} {t('project.projects')}
        </div>
        {projects.map((project) => (
          <div
            key={project.dir}
            onClick={() => handleSelectProject(project.dir)}
            className="px-4 py-3 hover:bg-accent cursor-pointer transition-colors border-b border-border/50"
          >
            <div className="flex items-center gap-3">
              <FolderOpen className="h-5 w-5 text-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{project.dirName}</div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{project.sessionCount} {t('session.sessions')}</span>
                  <span>•</span>
                  <span>{project.messageCount} {t('session.messages')}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDistanceToNow(new Date(project.lastModified), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Show sessions in selected project
  const projectSessions = projectMap[selectedProject] || []
  const projectInfo = projects.find(p => p.dir === selectedProject)

  return (
    <div>
      {/* Back button */}
      <button
        onClick={handleBackToProjects}
        className="w-full px-4 py-3 flex items-center gap-2 hover:bg-accent transition-colors text-left border-b border-border"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-sm">{t('project.back')}</span>
      </button>

      {/* Project info */}
      <div className="px-4 py-3 bg-background/50 border-b border-border">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-blue-400" />
          <div>
            <div className="text-sm font-medium">{projectInfo?.dirName}</div>
            <div className="text-xs text-muted-foreground">
              {projectSessions.length} {t('session.sessions')}
            </div>
          </div>
        </div>
      </div>

      {/* Sessions list */}
      <div className="divide-y divide-border/50">
        {projectSessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session)}
            className={`px-4 py-3 cursor-pointer hover:bg-accent transition-colors group ${
              selectedSession?.id === session.id ? 'bg-accent' : ''
            }`}
          >
            <div className="text-sm truncate mb-1">
              {session.name || session.first_message || t('session.untitled')}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDistanceToNow(new Date(session.modified), { addSuffix: true })}
              </div>
              <div className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {session.message_count}
              </div>
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