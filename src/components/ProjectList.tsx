import type { RefObject } from 'react'
import type { SessionInfo } from '../types'
import { FolderOpen, Loader2, ArrowLeft } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVirtualizer } from '@tanstack/react-virtual'
import OpenInTerminalButton from './OpenInTerminalButton'
import { SessionBadge } from './SessionBadge'

interface ProjectListProps {
  sessions: SessionInfo[]
  selectedSession: SessionInfo | null
  selectedProject?: string | null
  onSelectSession: (session: SessionInfo) => void
  onSelectProject?: (project: string | null) => void
  loading: boolean
  terminal?: 'iterm2' | 'terminal' | 'vscode' | 'custom'
  piPath?: string
  customCommand?: string
  getBadgeType?: (sessionId: string) => 'new' | 'updated' | null
  scrollParentRef?: RefObject<HTMLDivElement>
  showHeader?: boolean
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
  terminal = 'iterm2',
  piPath,
  customCommand,
  getBadgeType,
  scrollParentRef,
  showHeader = true,
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

  const sessionsVirtualizer = useVirtualizer({
    count: selectedProject ? projectSessions.length : 0,
    getScrollElement: () => scrollParentRef?.current ?? null,
    estimateSize: () => 44,
    overscan: 8,
  })

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

    const virtualItems = projectsVirtualizer.getVirtualItems()

    return (
      <div>
        <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/30">
          {t('project.list.count', { count: projects.length })}
        </div>
        <div
          className="relative w-full"
          style={{ height: `${projectsVirtualizer.getTotalSize()}px` }}
        >
          {virtualItems.map((virtualRow) => {
            const project = projects[virtualRow.index]
            if (!project) return null
            return (
              <div
                key={project.dir}
                data-index={virtualRow.index}
                ref={projectsVirtualizer.measureElement}
                onClick={() => handleSelectProject(project.dir)}
                className="px-3 py-3 hover:bg-[#262738] cursor-pointer transition-colors border-b border-border/20"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-[#1f2130] border border-border/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FolderOpen className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <div className="text-xs font-semibold truncate leading-tight">{project.dirName}</div>
                      <div className="text-[11px] text-muted-foreground/80 truncate">{project.dir}</div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-[#222334] border border-border/30">
                        {project.sessionCount} {t('project.list.sessions')}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#222334] border border-border/30">
                        {project.messageCount} {t('session.list.messages')}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#222334] border border-border/30">
                        {t('common.updated', '更新')} {formatShortTime(new Date(project.lastModified).toISOString())}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
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

      <div
        className="relative w-full"
        style={{ height: `${sessionsVirtualizer.getTotalSize()}px` }}
      >
        {sessionsVirtualizer.getVirtualItems().map((virtualRow) => {
          const session = projectSessions[virtualRow.index]
          if (!session) return null
          const hoverTitle = [
            session.name || session.first_message || t('session.list.untitled'),
            `路径: ${session.path}`,
            `创建: ${new Date(session.created).toLocaleString()}`,
            `更新: ${new Date(session.modified).toLocaleString()}`,
            `消息: ${session.message_count}`,
          ].join('\n')
          return (
            <div
              key={session.id}
              data-index={virtualRow.index}
              ref={sessionsVirtualizer.measureElement}
              onClick={() => onSelectSession(session)}
              title={hoverTitle}
              className={`px-3 py-2.5 cursor-pointer transition-colors group border-b border-border/20 ${
                selectedSession?.id === session.id ? 'bg-[#262738]' : 'hover:bg-[#222334]'
              }`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="text-xs font-medium truncate leading-tight flex-1 min-w-0">
                        {session.name || session.first_message || t('session.list.untitled')}
                      </div>
                      {getBadgeType && getBadgeType(session.id) && (
                        <div className="flex-shrink-0 mt-0.5">
                          <SessionBadge type={getBadgeType(session.id)!} />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground/80">
                      <span className="whitespace-nowrap">{t('common.created', '创建')} {formatShortTime(session.created)}</span>
                      <span className="text-border/60">·</span>
                      <span className="whitespace-nowrap">{t('common.updated', '更新')} {formatShortTime(session.modified)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                  <span className="px-2 py-0.5 rounded-md bg-[#222334] border border-border/30 text-right">
                    {session.message_count} {t('session.list.messages')}
                  </span>
                  <OpenInTerminalButton
                    session={session}
                    terminal={terminal}
                    piPath={piPath}
                    customCommand={customCommand}
                    size="sm"
                    variant="ghost"
                    onError={(error) => console.error('Failed to open in terminal:', error)}
                  />
                </div>
              </div>
            </div>
          )
        })}
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
