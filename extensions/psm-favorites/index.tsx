import { createElement } from 'react'
import type {
  PsmAppSidebarViewRenderProps,
  PsmAppViewRenderProps,
  PsmPluginHostContext,
  PsmProjectListActionRenderProps,
  PsmSessionContextMenuActionRenderProps,
  PsmSessionListActionRenderProps,
} from '@pi-session-manager/plugin-sdk'

import type { AppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'
import FavoritesPanel from '@/components/FavoritesPanel'
import {
  AppPluginSidebarBody,
  AppPluginSidebarHeader,
  AppPluginSidebarShell,
} from '@/components/app/AppPluginSidebarShell'
import { Star } from 'lucide-react'
import { manifest } from './manifest'
import { configureFavoritesStore, removeFavorite, toggleFavorite, useFavorites } from './store'

export { manifest }

const VIEW_ID = 'builtin.favorites.view'
const SIDEBAR_ID = 'builtin.favorites.sidebar'

function FavoritesView({ data }: PsmAppViewRenderProps<AppPluginSurfaceData>) {
  const { favorites, loading } = useFavorites()
  if (!data) return null
  return (
    <FavoritesPanel
      sessions={data.sessions}
      favorites={favorites}
      selectedSession={data.selectedSession}
      onSelectSession={data.onSelectSession}
      onRemoveFavorite={(item) => void removeFavorite(item.id)}
      onSelectProject={data.onSelectProject}
      liveSessionIds={data.liveSessionIds}
      loading={loading}
    />
  )
}

function FavoriteSessionAction({ session }: PsmSessionListActionRenderProps) {
  const { favorites } = useFavorites()
  const id = session.id ?? session.path
  const active = favorites.some((item) => item.type === 'session' && item.id === id)
  return (
    <button
      type="button"
      onClick={() => void toggleFavorite({ type: 'session', id, name: session.name ?? session.path, path: session.path })}
      className={`p-1 rounded ${active ? 'text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'}`}
      title={active ? 'Remove favorite' : 'Favorite'}
    >
      <Star className={`h-3 w-3 ${active ? 'fill-current' : ''}`} />
    </button>
  )
}

function FavoriteProjectAction({ project }: PsmProjectListActionRenderProps) {
  const { favorites } = useFavorites()
  const active = favorites.some((item) => item.type === 'project' && item.id === project.path)
  return (
    <button
      type="button"
      onClick={() => void toggleFavorite({ type: 'project', id: project.path, name: project.name, path: project.path })}
      className={`p-1 rounded ${active ? 'text-yellow-400' : 'text-muted-foreground hover:text-yellow-400'}`}
      title={active ? 'Remove favorite' : 'Favorite'}
    >
      <Star className={`h-3.5 w-3.5 ${active ? 'fill-current' : ''}`} />
    </button>
  )
}

function FavoriteContextAction({ session, close }: PsmSessionContextMenuActionRenderProps) {
  const { favorites } = useFavorites()
  const id = session.id ?? session.path
  const active = favorites.some((item) => item.type === 'session' && item.id === id)
  return (
    <button
      type="button"
      onClick={() => {
        void toggleFavorite({ type: 'session', id, name: session.name ?? session.path, path: session.path })
        close()
      }}
      className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-secondary"
    >
      <Star className={`h-3.5 w-3.5 ${active ? 'text-yellow-400 fill-current' : 'text-muted-foreground'}`} />
      <span className="text-xs">{active ? 'Remove favorite' : 'Favorite'}</span>
    </button>
  )
}

function FavoritesSidebar({ data }: PsmAppSidebarViewRenderProps<AppPluginSurfaceData>) {
  const { favorites, loading } = useFavorites()
  if (!data) return null
  return (
    <AppPluginSidebarShell label="Favorites">
      <AppPluginSidebarHeader
        icon={<Star className="h-4 w-4" />}
        title="Favorites"
        meta={`${favorites.length}`}
      />
      <AppPluginSidebarBody className="p-0">
        <FavoritesPanel
          sessions={data.sessions}
          favorites={favorites}
          selectedSession={data.selectedSession}
          onSelectSession={data.onSelectSession}
          onRemoveFavorite={(item) => void removeFavorite(item.id)}
          onSelectProject={data.onSelectProject}
          liveSessionIds={data.liveSessionIds}
          loading={loading}
          compact
        />
      </AppPluginSidebarBody>
    </AppPluginSidebarShell>
  )
}

export default function activate(ctx: PsmPluginHostContext) {
  configureFavoritesStore({
    list: () => ctx.psm.favorites.list(),
    toggle: (item) => ctx.psm.favorites.toggle(item),
    remove: (id) => ctx.psm.favorites.remove(id),
  })

  ctx.ui.registerAppView({
    id: VIEW_ID,
    title: ctx.i18n.t('favorites.title', 'Favorites'),
    route: '/favorites',
    icon: 'star',
    mainContent: 'keep',
    render: (props) => createElement(FavoritesView, props as PsmAppViewRenderProps<AppPluginSurfaceData>),
  })
  ctx.ui.registerAppSidebarView({
    id: SIDEBAR_ID,
    title: ctx.i18n.t('favorites.title', 'Favorites'),
    appViewId: VIEW_ID,
    route: '/favorites',
    render: (props) => createElement(FavoritesSidebar, props as PsmAppSidebarViewRenderProps<AppPluginSurfaceData>),
  })
  ctx.ui.registerSessionListAction({
    id: 'builtin.favorites.session-action',
    title: 'Favorite session',
    render: (props) => createElement(FavoriteSessionAction, props),
  })
  ctx.ui.registerProjectListAction({
    id: 'builtin.favorites.project-action',
    title: 'Favorite project',
    render: (props) => createElement(FavoriteProjectAction, props),
  })
  ctx.ui.registerSessionContextMenuAction({
    id: 'builtin.favorites.context-action',
    title: 'Favorite session',
    render: (props) => createElement(FavoriteContextAction, props),
  })
}
