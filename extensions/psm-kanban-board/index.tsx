import { createElement, lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import type {
  PsmAppSidebarViewRenderProps,
  PsmAppViewRenderProps,
  PsmPluginHostContext,
} from '@pi-session-manager/plugin-sdk'

import type { AppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'
import {
  AppPluginSidebarBody,
  AppPluginSidebarHeader,
  AppPluginSidebarShell,
  AppPluginSidebarState,
} from '@/components/app/AppPluginSidebarShell'

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
  const columnOrder = workspace.activeWorkspace.config.columnOrder
  const cardDensity = workspace.activeWorkspace.config.cardDensity
  const viewMode = workspace.activeWorkspace.config.viewMode

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
        columnOrder={columnOrder}
        cardDensity={cardDensity}
        viewMode={viewMode}
        onColumnOrderChange={(tagIds) => {
          void workspaceStore.updateActiveWorkspaceConfig({ columnOrder: tagIds })
        }}
        onCardDensityChange={(density) => {
          void workspaceStore.updateActiveWorkspaceConfig({ cardDensity: density })
        }}
        onViewModeChange={(nextViewMode) => {
          void workspaceStore.updateActiveWorkspaceConfig({ viewMode: nextViewMode })
        }}
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
      <AppPluginSidebarShell label="Kanban">
        <AppPluginSidebarHeader title="Kanban" subtitle="Workspaces" />
        <AppPluginSidebarState role="status">Kanban sidebar data unavailable</AppPluginSidebarState>
      </AppPluginSidebarShell>
    )
  }

  return (
    <AppPluginSidebarShell label="Kanban">
      <AppPluginSidebarHeader
        title="Kanban"
        subtitle="Workspaces and project filters"
      />
      <AppPluginSidebarBody className="overflow-hidden p-0">
        <WorkspacePanel data={data} workspaceStore={workspaceStore} />
      </AppPluginSidebarBody>
    </AppPluginSidebarShell>
  )
}

export default function activate(ctx: PsmPluginHostContext) {
  const workspaceStore = createKanbanWorkspaceStore(ctx)

  ctx.ui.registerAppView({
    id: KANBAN_VIEW_ID,
    title: ctx.i18n.t('plugins.kanbanBoard.title', 'Kanban Board'),
    route: '/kanban',
    icon: 'columns3',
    shortcut: 'Cmd+3',
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
