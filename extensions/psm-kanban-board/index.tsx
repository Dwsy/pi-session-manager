import { createElement, lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import type {
  PsmAppSidebarViewRenderProps,
  PsmAppViewRenderProps,
  PsmPluginHostContext,
} from '@pi-session-manager/plugin-sdk'

import type { AppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'

import { manifest } from './manifest'
import WorkspacePanel from './WorkspacePanel'
import {
  createKanbanWorkspaceStore,
  type KanbanWorkspaceStore,
  useKanbanWorkspaceSnapshot,
} from './workspaceStore'

export { manifest }

const KanbanBoard = lazy(() => import('./KanbanBoard'))
const KANBAN_VIEW_ID = 'builtin.kanban-board.view'
const KANBAN_SIDEBAR_VIEW_ID = 'builtin.kanban-board.sidebar'

type KanbanViewData = AppPluginSurfaceData
type KanbanSidebarData = Pick<
  AppPluginSurfaceData,
  | 'sessions'
  | 'tags'
  | 'sessionTags'
  | 'sourceOptions'
  | 'getDescendantIds'
  | 'onClearSelectedSession'
>

function isKanbanViewData(data: unknown): data is KanbanViewData {
  return typeof data === 'object' && data !== null
}

function isKanbanSidebarData(data: unknown): data is KanbanSidebarData {
  return typeof data === 'object' && data !== null
}

function KanbanAppView({
  data,
  workspaceStore,
}: PsmAppViewRenderProps<KanbanViewData> & { workspaceStore: KanbanWorkspaceStore }) {
  const workspace = useKanbanWorkspaceSnapshot(workspaceStore)

  if (!isKanbanViewData(data)) {
    return (
      <div className="h-full flex items-center justify-center px-4 text-sm text-muted-foreground">
        Kanban data unavailable
      </div>
    )
  }

  const projectFilter = workspace.activeWorkspace.config.projectFilter ?? workspace.selectedProject
  const filterTagIds = workspace.activeWorkspace.config.filterTagIds
  const sourceFilterSlugs = workspace.activeWorkspace.config.sourceFilterSlugs

  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center" role="status" aria-live="polite" aria-label="Loading">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Loading</span>
        </div>
      }
    >
      <KanbanBoard
        {...data}
        loading={data.loading || workspace.loading}
        projectFilter={projectFilter}
        filterTagIds={filterTagIds}
        sourceFilterSlugs={sourceFilterSlugs}
        onFilterChange={(tagIds) => {
          void workspaceStore.updateActiveWorkspaceConfig({ filterTagIds: tagIds })
        }}
      />
    </Suspense>
  )
}

function KanbanSidebarView({
  data,
  workspaceStore,
}: PsmAppSidebarViewRenderProps<KanbanSidebarData> & { workspaceStore: KanbanWorkspaceStore }) {
  if (!isKanbanSidebarData(data)) {
    return (
      <div className="h-full flex items-center justify-center px-3 text-xs text-muted-foreground">
        Kanban sidebar data unavailable
      </div>
    )
  }

  return <WorkspacePanel data={data} workspaceStore={workspaceStore} />
}

export default function activate(ctx: PsmPluginHostContext) {
  const workspaceStore = createKanbanWorkspaceStore(ctx)

  ctx.ui.registerAppView({
    id: KANBAN_VIEW_ID,
    title: ctx.i18n.t('plugins.kanbanBoard.title', 'Kanban Board'),
    route: '/kanban',
    icon: 'columns3',
    shortcut: 'Cmd+B',
    render: (props) => createElement(KanbanAppView, {
      ...(props as PsmAppViewRenderProps<KanbanViewData>),
      workspaceStore,
    }),
  })

  ctx.ui.registerAppSidebarView({
    id: KANBAN_SIDEBAR_VIEW_ID,
    title: ctx.i18n.t('plugins.kanbanBoard.sidebarTitle', 'Kanban Sidebar'),
    appViewId: KANBAN_VIEW_ID,
    route: '/kanban',
    render: (props) => createElement(KanbanSidebarView, {
      ...(props as PsmAppSidebarViewRenderProps<KanbanSidebarData>),
      workspaceStore,
    }),
  })
}
