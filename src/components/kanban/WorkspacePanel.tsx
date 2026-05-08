import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import CompositionInput from '@/components/ui/CompositionInput'
import { FolderOpen, Folder, Check, Search, Plus, Settings, Trash2, ChevronDown, Filter, Tag, LayoutGrid, FolderKanban } from 'lucide-react'
import type { SessionInfo } from '@/types'
import type { KanbanWorkspace } from '@/hooks/useWorkspaces'
import { getDirectoryName } from '@/utils/sessionDisplay'

interface WorkspacePanelProps {
  sessions: SessionInfo[]
  workspaceSessions?: SessionInfo[]
  selectedProject: string | null
  onSelectProject: (project: string | null) => void
  workspaces: KanbanWorkspace[]
  activeWorkspace: KanbanWorkspace
  activeWorkspaceId: string
  onSelectWorkspace: (id: string) => void
  onCreateWorkspace: () => void
  onEditWorkspace: (workspace: KanbanWorkspace) => void
  onDeleteWorkspace: (id: string) => void
}

interface Project {
  dir: string
  dirName: string
  sessionCount: number
  lastModified: number
}

export default function WorkspacePanel({
  sessions,
  workspaceSessions,
  selectedProject,
  onSelectProject,
  workspaces,
  activeWorkspace,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onEditWorkspace,
  onDeleteWorkspace,
}: WorkspacePanelProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false)

  const effectiveSessions = workspaceSessions ?? sessions

  const projects: Project[] = useMemo(() => {
    const projectMap = effectiveSessions.reduce((acc, session) => {
      const cwd = session.cwd || t('common.unknown')
      if (!acc[cwd]) {
        acc[cwd] = []
      }
      acc[cwd].push(session)
      return acc
    }, {} as Record<string, SessionInfo[]>)

    return Object.entries(projectMap)
      .map(([dir, dirSessions]) => ({
        dir,
        dirName: getDirectoryName(dir),
        sessionCount: dirSessions.length,
        lastModified: Math.max(
          ...dirSessions.map((s) => new Date(s.modified).getTime()),
        ),
      }))
      .filter(p => !searchQuery || p.dirName.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => b.lastModified - a.lastModified)
  }, [effectiveSessions, searchQuery, t])

  const hasFilters =
    activeWorkspace.config.projectFilter ||
    activeWorkspace.config.filterTagIds.length > 0 ||
    activeWorkspace.config.sourceFilterSlugs.length > 0

  return (
    <div className="h-full flex flex-col bg-card border-r border-border/10">
      {/* Workspace Switcher */}
      <div className="px-2 py-2 border-b border-border/10 relative">
        <button
          onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted motion-color text-xs font-medium"
        >
          {activeWorkspace.id === '__default__' ? (
            <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <FolderKanban className="h-3.5 w-3.5 text-primary" />
          )}
          <span className="flex-1 text-left truncate">{activeWorkspace.name}</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${isWorkspaceOpen ? 'rotate-180' : ''}`} />
        </button>

        {isWorkspaceOpen && (
          <div className="absolute z-50 top-full left-2 right-2 mt-1 bg-popover border border-border rounded-md shadow-lg py-1 animate-in fade-in-0 zoom-in-95">
            {workspaces.map(w => (
              <div key={w.id} className={`flex items-center group px-1 ${w.id === activeWorkspaceId ? 'bg-primary/5' : ''}`}>
                <button
                  onClick={() => { onSelectWorkspace(w.id); setIsWorkspaceOpen(false) }}
                  className="flex-1 flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted rounded-sm"
                >
                  {w.id === '__default__' ? (
                    <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <FolderKanban className="h-3.5 w-3.5 text-primary/80" />
                  )}
                  <span className="truncate">{w.name}</span>
                </button>
                {w.id !== '__default__' && (
                  <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); onEditWorkspace(w); setIsWorkspaceOpen(false) }} className="p-1 hover:text-primary"><Settings className="h-3 w-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDeleteWorkspace(w.id) }} className="p-1 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </div>
                )}
              </div>
            ))}
            <div className="border-t border-border/10 mt-1 pt-1 px-1">
              <button onClick={() => { onCreateWorkspace(); setIsWorkspaceOpen(false) }} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm">
                <Plus className="h-3 w-3" /> {t('kanban.workspace.create')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active Filter Badges */}
      {hasFilters && (
        <div className="px-2 py-1.5 border-b border-border/10 flex flex-wrap gap-1">
          {activeWorkspace.config.projectFilter && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
              <FolderOpen className="h-3 w-3" />
              {activeWorkspace.config.projectFilter.split('/').pop()}
            </span>
          )}
          {activeWorkspace.config.filterTagIds.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
              <Tag className="h-3 w-3" />
              {activeWorkspace.config.filterTagIds.length} tags
            </span>
          )}
          {activeWorkspace.config.sourceFilterSlugs.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
              <Filter className="h-3 w-3" />
              {activeWorkspace.config.sourceFilterSlugs.length} sources
            </span>
          )}
        </div>
      )}

      {/* Search Input */}
      <div className="px-2 py-1.5 border-b border-border/10">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <CompositionInput
            type="text"
            placeholder={t('common.searchProjectsPlaceholder')}
            value={searchQuery}
            onChange={setSearchQuery}
            className="w-full pl-7 pr-2 py-1.5 bg-muted/30 border border-transparent focus:border-primary/30 rounded-md text-xs outline-none transition-colors"
          />
        </div>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto">
        <button
          onClick={() => onSelectProject(null)}
          className={`w-full px-3 py-2 flex items-center gap-2 text-xs border-b border-border/5 ${
            selectedProject === null ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          <Folder className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">{t('project.filter.allProjects')}</span>
          {selectedProject === null && <Check className="h-3 w-3" />}
        </button>

        {projects.map(project => (
          <button
            key={project.dir}
            onClick={() => onSelectProject(project.dir)}
            className={`w-full px-3 py-2 flex items-center gap-2 text-xs border-b border-border/5 ${
              selectedProject === project.dir ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            <FolderOpen className="h-3.5 w-3.5 opacity-60" />
            <span className="flex-1 text-left truncate">{project.dirName}</span>
            <span className="text-[10px] opacity-60">{project.sessionCount}</span>
          </button>
        ))}

        {projects.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            {searchQuery ? t('common.noResults') : t('project.noProjects')}
          </div>
        )}
      </div>
    </div>
  )
}
