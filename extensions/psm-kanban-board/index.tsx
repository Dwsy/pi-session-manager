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

import KanbanSessionColumnCell from './views/KanbanSessionColumnCell'
import { manifest } from './manifest'
import {
  KANBAN_SESSION_COLUMN_ID,
  KANBAN_SIDEBAR_VIEW_ID,
  KANBAN_VIEW_ID,
} from './viewIds'
import WorkspacePanel from './workspace/WorkspacePanel'
import {
  createKanbanWorkspaceStore,
  type KanbanWorkspaceStore,
  useKanbanWorkspaceSnapshot,
} from './workspace/workspaceStore'
import {
  createKanbanLabelsStore,
  type KanbanLabelsStore,
  useKanbanLabelsSnapshot,
} from './labels/kanbanLabelsStore'

export { manifest }

const KanbanBoard = lazy(() => import('./board/KanbanBoard'))

type KanbanViewData = AppPluginSurfaceData
type KanbanSidebarData = Pick<
  AppPluginSurfaceData,
  | 'sessions'
  | 'tags'
  | 'sessionTags'
  | 'sourceOptions'
  | 'getDescendantIds'
  | 'onMoveSession'
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
  labelsStore,
}: PsmAppViewRenderProps<KanbanViewData> & {
  workspaceStore: KanbanWorkspaceStore
  labelsStore: KanbanLabelsStore
}) {
  const workspace = useKanbanWorkspaceSnapshot(workspaceStore)
  const labelSnapshot = useKanbanLabelsSnapshot(labelsStore)

  if (!isKanbanViewData(data)) {
    return (
      <div className="h-full flex items-center justify-center px-4 text-sm text-muted-foreground">
        Kanban data unavailable
      </div>
    )
  }

  const projectFilter = workspace.activeWorkspace.config.projectFilter ?? workspace.selectedProject
  const filterStatusIds = workspace.activeWorkspace.config.filterStatusIds
  const sourceFilterSlugs = workspace.activeWorkspace.config.sourceFilterSlugs
  const statusOrder = workspace.activeWorkspace.config.statusOrder
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
        loading={data.loading || workspace.loading || labelSnapshot.loading}
        statuses={data.tags}
        statusAssignments={data.sessionTags}
        labels={labelSnapshot.labels}
        labelAssignments={labelSnapshot.assignments}
        onToggleLabel={(sessionId, labelId, assigned) => {
          void labelsStore.toggleLabel(sessionId, labelId, assigned)
        }}
        onCreateLabel={(input) => labelsStore.createLabel(input)}
        onUpdateLabel={(id, updates) => labelsStore.updateLabel(id, updates)}
        onDeleteLabel={(id) => labelsStore.deleteLabel(id)}
        projectFilter={projectFilter}
        filterStatusIds={filterStatusIds}
        sourceFilterSlugs={sourceFilterSlugs}
        statusOrder={statusOrder}
        cardDensity={cardDensity}
        viewMode={viewMode}
        onStatusOrderChange={(statusIds) => {
          void workspaceStore.updateActiveWorkspaceConfig({ statusOrder: statusIds })
        }}
        onCardDensityChange={(density) => {
          void workspaceStore.updateActiveWorkspaceConfig({ cardDensity: density })
        }}
        onViewModeChange={(nextViewMode) => {
          void workspaceStore.updateActiveWorkspaceConfig({ viewMode: nextViewMode })
        }}
        onStatusFilterChange={(statusIds) => {
          void workspaceStore.updateActiveWorkspaceConfig({ filterStatusIds: statusIds })
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
  const labelsStore = createKanbanLabelsStore(ctx)

  ctx.ui.registerAppView({
    id: KANBAN_VIEW_ID,
    title: ctx.i18n.t('plugins.kanbanBoard.title', 'Kanban Board'),
    route: '/kanban',
    icon: 'columns3',
    shortcut: 'Cmd+3',
    render: (props) => createElement(KanbanAppView, {
      ...(props as PsmAppViewRenderProps<KanbanViewData>),
      workspaceStore,
      labelsStore,
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

  ctx.ui.registerSessionListColumn({
    id: KANBAN_SESSION_COLUMN_ID,
    title: ctx.i18n.t('plugins.kanbanBoard.sessionColumn.title', 'Kanban'),
    width: 180,
    order: 10,
    render: (props) => createElement(KanbanSessionColumnCell, props),
  })
}
