import type { ReactNode } from 'react'
import type { AppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'
import type { SessionInfo, FavoriteItem } from '@/types'
import { usePsmPluginSessionUi } from '@/plugins/runtime-host/usePsmPluginSessionUi'
import { PluginContributionBoundary, PluginContributionSlot } from '@/plugins/runtime-host'
import KanbanSessionContextMenu from '../psm-kanban-board/board/KanbanSessionContextMenu'
import { getSessionStatusId } from '../psm-kanban-board/board/kanbanBoardModel'

export default function MeshSessionMenu({ session, point, data, favorites, onToggleFavorite, onResume, extraActions, onClose }: {
  session: SessionInfo; point: { x: number; y: number }; data?: AppPluginSurfaceData
  favorites: FavoriteItem[]; onToggleFavorite: (item: Omit<FavoriteItem, 'addedAt'>) => void
  onResume: (session: SessionInfo) => void | Promise<void>; extraActions: ReactNode; onClose: () => void
}) {
  const { sessionContextMenuActions = [] } = usePsmPluginSessionUi()
  const currentStatusId = getSessionStatusId(data?.tags ?? [], data?.sessionTags ?? [], session.id)
  return (
    <KanbanSessionContextMenu session={session} position={point}
      statuses={data?.tags ?? []} currentStatusId={currentStatusId}
      labels={[]} allLabels={[]} favorites={favorites} onToggleFavorite={onToggleFavorite}
      onClose={onClose} extraActions={extraActions}
      metadataActions={sessionContextMenuActions.length ? <>
        {sessionContextMenuActions.map((action) => (
          <PluginContributionBoundary key={action.id} pluginId={action.pluginId} contributionId={action.id} title={action.title}>
            <PluginContributionSlot render={() => action.render({
              session: { path: session.path, id: session.id, name: session.name, cwd: session.cwd },
              close: onClose, onActivate: () => {},
            })} />
          </PluginContributionBoundary>
        ))}
      </> : undefined}
      onSetStatus={(statusId) => {
        if (statusId) data?.onMoveSession(session.id, currentStatusId, statusId, 0)
        else if (currentStatusId) data?.onClearSessionStatus(session.id, currentStatusId)
        onClose()
      }}
      onToggleLabel={() => {}}
      onDeleteSession={data?.onDeleteSession}
      onResumeSession={onResume} onCopyResumeSession={data?.onCopyResumeSession}
      onOpenPreviewRenameDialog={data?.onOpenPreviewRenameDialog}
      terminal={data?.terminal} piPath={data?.piPath}
      customCommand={data?.customCommand} resumeCommand={data?.resumeCommand}
    />
  )
}
