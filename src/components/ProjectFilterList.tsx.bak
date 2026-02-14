import type { SessionInfo } from '../types'
import { FolderOpen, Folder, Check } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { RefObject } from 'react'

interface ProjectFilterListProps {
  sessions: SessionInfo[]
  selectedProject: string | null
  onSelectProject: (project: string | null) => void
  scrollParentRef?: RefObject<HTMLDivElement>
}

interface Project {
  dir: string
  dirName: string
  sessionCount: number
  messageCount: number
  lastModified: number
}

export default function ProjectFilterList({
  sessions,
  selectedProject,
  onSelectProject,
  scrollParentRef,
}: ProjectFilterListProps) {
  const { t } = useTranslation()

  const projects: Project[] = useMemo(() => {
    const projectMap = sessions.reduce((acc, session) => {
      const cwd = session.cwd || t('common.unknown')
      if (!acc[cwd]) {
        acc[cwd] = []
      }
      acc[cwd].push(session)
      return acc
    }, {} as Record<string, SessionInfo[]>)

    const list = Object.entries(projectMap).map(([dir, dirSessions]) => ({
      dir,
      dirName: getDirectoryName(dir),
      sessionCount: dirSessions.length,
      messageCount: dirSessions.reduce((sum, s) => sum + s.message_count, 0),
      lastModified: Math.max(...dirSessions.map(s => new Date(s.modified).getTime())),
    }))

    list.sort((a, b) => b.lastModified - a.lastModified)
    return list
  }, [sessions, t])

  const totalSessions = sessions.length

  const virtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => scrollParentRef?.current ?? null,
    estimateSize: () => 52,
    overscan: 8,
  })

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border/10 flex items-center justify-between">
        <span>{t('project.filter.title')}</span>
        <span className="text-muted-foreground/60">
          {projects.length} {t('project.list.projects')}
        </span>
      </div>

      {/* "All Projects" Option */}
      <button
        onClick={() => onSelectProject(null)}
        className={`w-full px-3 py-2.5 flex items-center gap-2.5 transition-colors border-b border-border/10 ${
          selectedProject === null
            ? 'bg-info/10 text-foreground'
            : 'hover:bg-background/50 text-muted-foreground'
        }`}
      >
        <div className={`h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 ${
          selectedProject === null
            ? 'bg-info/20 text-info'
            : 'bg-surface border border-border/40 text-muted-foreground'
        }`}>
          <Folder className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 text-left">
          <div className="text-xs font-medium">
            {t('project.filter.allProjects')}
          </div>
          <div className="text-[10px] text-muted-foreground/70">
            {totalSessions} {t('project.list.sessions')}
          </div>
        </div>
        {selectedProject === null && (
          <Check className="h-3.5 w-3.5 text-info" />
        )}
      </button>

      {/* Project List */}
      <div className="flex-1 overflow-hidden relative">
        <div
          className="absolute inset-0 w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualItems.map((virtualRow) => {
            const project = projects[virtualRow.index]
            if (!project) return null

            const isSelected = selectedProject === project.dir

            return (
              <button
                key={project.dir}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                onClick={() => onSelectProject(project.dir)}
                className={`w-full px-3 py-2 flex items-center gap-2.5 transition-colors text-left border-b border-border/5 ${
                  isSelected
                    ? 'bg-info/10'
                    : 'hover:bg-background/50'
                }`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className={`h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                  isSelected
                    ? 'bg-info/20 text-info'
                    : 'bg-surface border border-border/40 text-blue-400'
                }`}>
                  <FolderOpen className="h-3 w-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium truncate ${
                    isSelected ? 'text-foreground' : 'text-muted-foreground'
                  }`}>
                    {project.dirName}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                    <span>{project.sessionCount} {t('project.list.sessions')}</span>
                    <span>·</span>
                    <span>{project.messageCount} {t('session.list.messages')}</span>
                  </div>
                </div>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 text-info flex-shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function getDirectoryName(cwd: string): string {
  if (!cwd || cwd === 'Unknown' || cwd === '未知') {
    return cwd || 'Unknown Directory'
  }

  const parts = cwd.split(/[\/]/)
  const lastPart = parts[parts.length - 1]

  if (lastPart && lastPart.length > 0) {
    return lastPart
  }

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]} / ${parts[parts.length - 1]}`
  }

  return cwd
}
