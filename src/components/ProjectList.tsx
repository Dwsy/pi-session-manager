import type { RefObject } from 'react'
import type { SessionInfo, FavoriteItem } from '../types'
import { FolderOpen, ArrowLeft, Star } from 'lucide-react'
import { ProjectListSkeleton } from './Skeleton'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import SessionList from './SessionList'

interface ProjectListProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  selectedProject?: string | null
  onSelectSession: (session: SessionInfo) => void
  onSelectProject?: (project: string | null) => void
  onDeleteSession?: (session: SessionInfo) => void
  loading: boolean
  terminal?: 'iterm2' | 'terminal' | 'vscode' | 'custom'
  piPath?: string
  customCommand?: string
  getBadgeType?: (sessionId: string) => 'new' | 'updated' | null
  scrollParentRef?: RefObject<HTMLDivElement>
  showHeader?: boolean
  favorites?: FavoriteItem[]
  onToggleFavorite?: (item: Omit<FavoriteItem, 'addedAt'>) => void
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
  onDeleteSession,
  loading,
  terminal = 'iterm2',
  piPath,
  customCommand,
  getBadgeType,
  scrollParentRef,
  showHeader = true,
  favorites = [],
  onToggleFavorite,
}: ProjectListProps) {
  const { t } = useTranslation()
  // Use external selectedProject if provided, otherwise use internal state
  const [internalSelectedProject, setInternalSelectedProject] = useState<string | null>(null)
  const selectedProject = externalSelectedProject !== undefined ? externalSelectedProject : internalSelectedProject
  const setSelectedProject = onSelectProject || setInternalSelectedProject

  const projectMap = useMemo(() => {
    return sessions.reduce((acc, session) => {
      const cwd = session.cwd || t('common.unknown')
      if (!acc[cwd]) {
        acc[cwd] = []
      }
      acc[cwd].push(session)
      return acc
    }, {} as Record<string, SessionInfo[]>)
  }, [sessions, t])

  const projects: Project[] = useMemo(() => {
    const list = Object.entries(projectMap).map(([dir, dirSessions]) => ({
      dir,
      dirName: getDirectoryName(dir),
      sessionCount: dirSessions.length,
      messageCount: dirSessions.reduce((sum, s) => sum + s.message_count, 0),
      lastModified: Math.max(...dirSessions.map(s => new Date(s.modified).getTime())),
    }))
    list.sort((a, b) => b.lastModified - a.lastModified)
    return list
  }, [projectMap])

  const handleBackToProjects = () => {
    setSelectedProject(null)
  }

  const handleSelectProject = (dir: string) => {
    setSelectedProject(dir)
  }

  const projectSessions = selectedProject ? (projectMap[selectedProject] || []) : []
  const projectInfo = selectedProject ? projects.find(p => p.dir === selectedProject) : null

  const projectsVirtualizer = useVirtualizer({
    count: selectedProject ? 0 : projects.length,
    getScrollElement: () => scrollParentRef?.current ?? null,
    estimateSize: () => 56,
    overscan: 8,
  })

  if (!selectedProject) {
    if (loading) {
      return <ProjectListSkeleton />
    }

    if (projects.length === 0) {
      return (
        <div className="p-6 text-center text-muted-foreground">
          <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-xs">{t('project.list.empty')}</p>
        </div>
      )
    }

    const virtualItems = projectsVirtualizer.getVirtualItems()

    return (
      <div>
        <div className="px-3 py-2 text-[11px] text-muted-foreground border-b border-border/10">
          {t('project.list.count', { count: projects.length })}
        </div>
        <div
          className="relative w-full"
          style={{ height: `${projectsVirtualizer.getTotalSize()}px` }}
        >
          {virtualItems.map((virtualRow) => {
            const project = projects[virtualRow.index]
            if (!project) return null
            const isFavorite = favorites.some(f => f.type === 'project' && f.id === project.dir)
            return (
              <div
                key={project.dir}
                data-index={virtualRow.index}
                ref={projectsVirtualizer.measureElement}
                className="px-3 py-2 hover:bg-[#1a1b26] cursor-pointer transition-colors border-b border-border/10 group"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1" onClick={() => handleSelectProject(project.dir)}>
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="h-3 w-3 text-blue-400 flex-shrink-0" />
                      <div className="text-[11px] font-medium truncate leading-tight">{project.dirName}</div>
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5">{formatDirectory(project.dir)}</div>
                    <div className="flex items-center gap-3 mt-1.5 text-[9px] text-muted-foreground tabular-nums">
                      <span className="w-16 truncate">{project.sessionCount} {t('project.list.sessions')}</span>
                      <span className="w-20 truncate">{project.messageCount} {t('session.list.messages')}</span>
                      <span className="w-16 truncate">{formatShortTime(new Date(project.lastModified).toISOString(), t)}</span>
                    </div>
                  </div>
                  {onToggleFavorite && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleFavorite({
                          type: 'project',
                          id: project.dir,
                          name: project.dirName,
                          path: project.dir,
                        })
                      }}
                      className={`p-1 rounded transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100 ${
                        isFavorite ? 'text-yellow-400 opacity-100' : 'text-muted-foreground hover:text-yellow-400'
                      }`}
                      title={isFavorite ? t('favorites.remove') : t('favorites.add')}
                    >
                      <Star className={`h-3 w-3 ${isFavorite ? 'fill-current' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {showHeader && (
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
            <span className="text-xs font-medium truncate">{projectInfo?.dirName}</span>
            <span className="text-[11px] text-muted-foreground flex-shrink-0">({projectSessions.length})</span>
          </div>
        </div>
      )}

      <SessionList
        sessions={projectSessions}
        selectedSession={selectedSession}
        onSelectSession={onSelectSession}
        onDeleteSession={onDeleteSession}
        loading={loading}
        getBadgeType={getBadgeType}
        terminal={terminal}
        piPath={piPath}
        customCommand={customCommand}
        scrollParentRef={scrollParentRef}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        showDirectory={false}
      />
    </div>
  )
}

function formatDirectory(path: string): string {
  if (!path) return ''

  const parts = path.split('/').filter(Boolean)
  if (parts.length <= 2) return path

  return '.../' + parts.slice(-2).join('/')
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

function formatShortTime(date: string, t: TFunction): string {
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t('common.time.justNow')
  if (diffMins < 60) return t('common.time.minutesAgo', { count: diffMins })
  if (diffHours < 24) return t('common.time.hoursAgo', { count: diffHours })
  if (diffDays < 30) return t('common.time.daysAgo', { count: diffDays })
  return t('common.time.monthsAgo', { count: Math.floor(diffDays / 30) })
}
