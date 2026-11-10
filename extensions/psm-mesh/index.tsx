import { createElement } from 'react'
import type {
  PsmAppSidebarViewRenderProps,
  PsmAppViewRenderProps,
  PsmPluginHostContext,
} from '@dwsy/plugin-sdk'

import type { AppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'
import MeshWorkspace from './MeshWorkspace'
import MeshSidebar from './MeshSidebar'
import { manifest } from './manifest'
import { MESH_SIDEBAR_VIEW_ID, MESH_VIEW_ID } from './viewIds'
import { createMeshStore, type MeshStore } from './meshStore'

export { manifest }

function MeshAppView({
  data,
  active,
  ctx,
  meshStore,
}: PsmAppViewRenderProps<AppPluginSurfaceData> & { ctx: PsmPluginHostContext; meshStore: MeshStore }) {
  return <MeshWorkspace ctx={ctx} data={data} active={active} fullPage meshStore={meshStore} />
}

function MeshSidebarView({
  data,
  active,
  ctx,
  meshStore,
}: PsmAppSidebarViewRenderProps<AppPluginSurfaceData> & { ctx: PsmPluginHostContext; meshStore: MeshStore }) {
  return <MeshSidebar ctx={ctx} data={data} active={active} meshStore={meshStore} />
}

export default function activate(ctx: PsmPluginHostContext) {
  const meshStore = createMeshStore(ctx)

  // Register App View covering the main workspace (like Kanban)
  ctx.ui.registerAppView({
    id: MESH_VIEW_ID,
    title: ctx.i18n.t('plugins.psmMesh.title', 'Mesh'),
    route: '/mesh',
    icon: 'network',
    shortcut: 'Cmd+4',
    render: (props) => createElement(MeshAppView, {
      ...(props as PsmAppViewRenderProps<AppPluginSurfaceData>),
      ctx,
      meshStore,
    }),
  })

  // Register Sidebar View providing compact overview and filters
  ctx.ui.registerAppSidebarView({
    id: MESH_SIDEBAR_VIEW_ID,
    title: ctx.i18n.t('plugins.psmMesh.title', 'Mesh'),
    appViewId: MESH_VIEW_ID,
    route: '/mesh',
    render: (props) => createElement(MeshSidebarView, {
      ...(props as PsmAppSidebarViewRenderProps<AppPluginSurfaceData>),
      ctx,
      meshStore,
    }),
  })

  return { dispose: () => meshStore.dispose() }
}
