import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Archive,
  Check,
  ChevronDown,
  Filter,
  Folder,
  FolderKanban,
  FolderOpen,
  LayoutGrid,
  Loader2,
  Pin,
  Plus,
  Search,
  Settings,
  Tag,
  Trash2,
} from 'lucide-react'

import CompositionInput from '@/components/ui/CompositionInput'
import type { AppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'
import type { SessionInfo } from '@/types'
import { getDirectoryName } from '@/utils/sessionDisplay'
import { filterSessions } from '@/utils/sessionFilters'

import WorkspaceEditor from './WorkspaceEditor'
import type { KanbanWorkspace, KanbanWorkspaceStore } from './workspaceStore'
import { useKanbanWorkspaceSnapshot } from './workspaceStore'

interface WorkspacePanelProps {
  data: Pick<
    AppPluginSurfaceData,
    | 'sessions'
    | 'tags'
    | 'sessionTags'
    | 'sourceOptions'
    | 'getDescendantIds'
    | 'onMoveSession'
    | 'onClearSelectedSession'
  >
  workspaceStore: KanbanWorkspaceStore
}

interface Project {
  dir: string
  dirName: string
  sessionCount: number
  lastModified: number
}

export default function WorkspacePanel({
  data,
  workspaceStore,
}: WorkspacePanelProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<KanbanWorkspace | null>(null)
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    selectedProject,
    loading,
  } = useKanbanWorkspaceSnapshot(workspaceStore)

  const effectiveProjectFilter = activeWorkspace.config.projectFilter ?? selectedProject
  const effectiveSessions = useMemo(() => (
    filterSessions({
      sessions: data.sessions,
      projectFilter: activeWorkspace.config.projectFilter,
      filterTagIds: activeWorkspace.config.filterStatusIds,
      sourceFilterSlugs: activeWorkspace.config.sourceFilterSlugs,
      sessionTags: data.sessionTags,
      getDescendantIds: data.getDescendantIds,
      timeRange: 'any',
    })
  ), [activeWorkspace, data.getDescendantIds, data.sessionTags, data.sessions])

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
        lastModified: Math.max(...dirSessions.map((session) => new Date(session.modified).getTime())),
      }))
      .filter((project) => !searchQuery || project.dirName.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => b.lastModified - a.lastModified)
  }, [effectiveSessions, searchQuery, t])

  const archiveStatus = data.tags.find((status) => status.id === 'builtin-archive')

  const hasFilters =
    activeWorkspace.config.projectFilter ||
    activeWorkspace.config.filterStatusIds.length > 0 ||
    activeWorkspace.config.sourceFilterSlugs.length > 0

  const openCreateEditor = () => {
    setEditingWorkspace(null)
    setShowEditor(true)
  }

  const openEditEditor = (workspace: KanbanWorkspace) => {
    setEditingWorkspace(workspace)
    setShowEditor(true)
  }

  const selectProject = (project: string | null) => {
    workspaceStore.selectProject(project)
    data.onClearSelectedSession()
  }

  const togglePinnedProject = (project: string) => {
    const nextProject = activeWorkspace.config.projectFilter === project ? null : project
    void workspaceStore.updateActiveWorkspaceConfig({ projectFilter: nextProject })
    workspaceStore.selectProject(null)
    data.onClearSelectedSession()
  }

  const archiveProject = (project: string) => {
    if (!archiveStatus) return
    for (const session of effectiveSessions) {
      if (session.cwd !== project) continue
      const currentAssignments = data.sessionTags.filter((assignment) => assignment.sessionId === session.id)
      const currentStatusId = currentAssignments.length > 0
        ? [...currentAssignments].sort((left, right) => Date.parse(right.assignedAt) - Date.parse(left.assignedAt))[0]?.tagId ?? null
        : null
      if (currentStatusId !== archiveStatus.id) {
        data.onMoveSession(session.id, currentStatusId, archiveStatus.id, 0)
      }
    }
    data.onClearSelectedSession()
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="relative border-b border-border/65 px-2 py-2">
        <button
          type="button"
          onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
          className="flex h-8 w-full items-center gap-2 rounded-md border border-border/65 px-2 text-xs font-medium hover:bg-secondary/55"
          aria-expanded={isWorkspaceOpen}
          aria-haspopup="menu"
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
          <div className="absolute left-2 right-2 top-full z-50 mt-1 rounded-md border border-border/75 bg-popover py-1 shadow-sm" role="menu">
            {workspaces.map((workspace) => (
              <div key={workspace.id} className={`flex items-center group px-1 ${workspace.id === activeWorkspaceId ? 'bg-primary/5' : ''}`}>
                <button
                  onClick={() => {
                    workspaceStore.selectWorkspace(workspace.id)
                    setIsWorkspaceOpen(false)
                  }}
                  className="flex-1 flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted rounded-sm"
                >
                  {workspace.id === '__default__' ? (
                    <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <FolderKanban className="h-3.5 w-3.5 text-primary/80" />
                  )}
                  <span className="truncate">{workspace.name}</span>
                </button>
                {workspace.id !== '__default__' && (
                  <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        openEditEditor(workspace)
                        setIsWorkspaceOpen(false)
                      }}
                      className="p-1 hover:text-primary"
                    >
                      <Settings className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        void workspaceStore.deleteWorkspace(workspace.id)
                      }}
                      className="p-1 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div className="border-t border-border/10 mt-1 pt-1 px-1">
              <button
                onClick={() => {
                  openCreateEditor()
                  setIsWorkspaceOpen(false)
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm"
              >
                <Plus className="h-3 w-3" />
                {t('plugins.kanbanBoard.workspace.create')}
              </button>
            </div>
          </div>
        )}
      </div>

      {hasFilters && (
        <div className="px-2 py-1.5 border-b border-border/10 flex flex-wrap gap-1">
          {activeWorkspace.config.projectFilter && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
              <FolderOpen className="h-3 w-3" />
              {activeWorkspace.config.projectFilter.split('/').pop()}
            </span>
          )}
          {activeWorkspace.config.filterStatusIds.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
              <Tag className="h-3 w-3" />
              {activeWorkspace.config.filterStatusIds.length} statuses
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

      <div className="border-b border-border/65 px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <CompositionInput
            type="text"
            placeholder={t('common.searchProjectsPlaceholder')}
            value={searchQuery}
            onChange={setSearchQuery}
            className="h-8 w-full rounded-md border border-border/65 bg-background py-1.5 pl-7 pr-2 text-xs outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/15"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <button
          onClick={() => selectProject(null)}
          className={`w-full px-3 py-2 flex items-center gap-2 text-xs border-b border-border/5 ${
            effectiveProjectFilter === null ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          <Folder className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">{t('project.filter.allProjects')}</span>
          {effectiveProjectFilter === null && <Check className="h-3 w-3" />}
        </button>

        {projects.map((project) => {
          const isActiveProject = effectiveProjectFilter === project.dir
          const isPinnedProject = activeWorkspace.config.projectFilter === project.dir

          return (
            <div
              key={project.dir}
              className={`group flex items-stretch border-b border-border/5 ${
                isActiveProject ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <button
                type="button"
                aria-label={`Select project ${project.dirName}`}
                onClick={() => selectProject(project.dir)}
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-xs"
              >
                <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="flex-1 truncate text-left">{project.dirName}</span>
              </button>
              <div className="relative flex w-14 shrink-0 items-center justify-end pr-2">
                <span className={`text-[10px] ${isPinnedProject ? 'opacity-0' : 'opacity-60 group-hover:opacity-0'}`}>
                  {project.sessionCount}
                </span>
                <div className={`absolute right-1 flex items-center gap-0.5 ${isPinnedProject ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  <button
                    type="button"
                    aria-label={`Archive project ${project.dirName}`}
                    title="Archive project"
                    onClick={() => archiveProject(project.dir)}
                    disabled={!archiveStatus}
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-primary focus-ring disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${isPinnedProject ? 'Unpin' : 'Pin'} project ${project.dirName}`}
                    title={isPinnedProject ? 'Unpin project' : 'Pin project'}
                    onClick={() => togglePinnedProject(project.dir)}
                    className={`flex h-5 w-5 items-center justify-center rounded focus-ring hover:text-primary ${
                      isPinnedProject ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    <Pin className={`h-3.5 w-3.5 ${isPinnedProject ? 'fill-current' : ''}`} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {projects.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            {searchQuery ? t('common.noResults') : t('project.noProjects')}
          </div>
        )}
      </div>

      {showEditor && (
        <WorkspaceEditor
          workspace={editingWorkspace}
          sessions={data.sessions}
          statuses={data.tags}
          sourceOptions={data.sourceOptions}
          onSave={(workspace) => workspaceStore.saveWorkspace(workspace)}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  )
}
