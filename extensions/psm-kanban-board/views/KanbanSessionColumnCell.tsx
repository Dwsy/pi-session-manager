import { useTranslation } from 'react-i18next'
import type { PsmSessionListColumnRenderProps } from '@pi-session-manager/plugin-sdk'

import { useOptionalAppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'
import TagBadge from '@/components/tags/TagBadge'

import { KANBAN_VIEW_ID } from '../viewIds'
import { getSessionStatusId } from '../board/kanbanBoardModel'

/** Shows the canonical single Kanban status in host session tables. */
export default function KanbanSessionColumnCell({ session }: PsmSessionListColumnRenderProps) {
  const { t } = useTranslation()
  const surface = useOptionalAppPluginSurfaceData()

  if (!surface || !session.id) return null

  const statusId = getSessionStatusId(surface.tags, surface.sessionTags, session.id)
  const status = statusId ? surface.tags.find((item) => item.id === statusId) ?? null : null
  const openBoard = surface.onOpenAppView
    ? () => surface.onOpenAppView?.(KANBAN_VIEW_ID)
    : undefined
  const label = t('plugins.kanbanBoard.sessionColumn.openBoard', 'Show in Kanban board')

  return (
    <button
      type="button"
      onClick={(event) => {
        if (!openBoard) return
        event.stopPropagation()
        openBoard()
      }}
      disabled={!openBoard}
      className="flex min-w-0 max-w-full items-center gap-1 rounded px-1 py-0.5 text-left motion-color focus-ring hover:bg-secondary disabled:pointer-events-none"
      title={label}
      aria-label={label}
    >
      {status ? <TagBadge tag={status} compact={false} /> : (
        <span className="text-muted-foreground/45" aria-hidden="true">—</span>
      )}
    </button>
  )
}
