import { useTranslation } from 'react-i18next'
import type { PsmSessionListColumnRenderProps } from '@pi-session-manager/plugin-sdk'

import { useOptionalAppPluginSurfaceData } from '@/components/app/AppPluginSurfaceData'
import TagBadge from '@/components/tags/TagBadge'

import { KANBAN_VIEW_ID } from './viewIds'

const MAX_VISIBLE_TAGS = 2

/**
 * Shows which board column a session currently sits in, so host session tables
 * expose the same status the Kanban view assigns through labels.
 */
export default function KanbanSessionColumnCell({ session }: PsmSessionListColumnRenderProps) {
  const { t } = useTranslation()
  const surface = useOptionalAppPluginSurfaceData()

  if (!surface || !session.id) return null

  const tags = surface.getTagsForSession(session.id)
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
      {tags.length === 0 ? (
        <span className="text-muted-foreground/45" aria-hidden="true">
          —
        </span>
      ) : (
        <span className="flex min-w-0 items-center gap-1 overflow-hidden">
          {tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
            <TagBadge key={tag.id} tag={tag} compact={false} />
          ))}
          {tags.length > MAX_VISIBLE_TAGS && (
            <span className="text-[9px] text-muted-foreground">
              +{tags.length - MAX_VISIBLE_TAGS}
            </span>
          )}
        </span>
      )}
    </button>
  )
}
