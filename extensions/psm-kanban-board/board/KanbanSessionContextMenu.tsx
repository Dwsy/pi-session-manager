import type { SessionInfo, Tag, FavoriteItem } from '@/types'
import type { DeleteSessionRequestOptions } from '@/components/dialogs/deleteSessionTypes'
import { useClipboard } from '@/hooks/useClipboard'
import { useFavorites } from '@/hooks/app/useFavorites'
import { invoke, isTauri } from '@/transport'
import {
  buildCopyResumeCommand,
  openSessionInTerminalDirect,
} from '@/utils/sessionResume'

import type { KanbanLabel } from '../labels/kanbanLabelsStore'
import KanbanContextMenu from './KanbanContextMenu'

interface KanbanSessionContextMenuProps {
  session: SessionInfo
  position: { x: number; y: number }
  statuses: Tag[]
  currentStatusId: string | null
  labels: KanbanLabel[]
  allLabels: KanbanLabel[]
  favorites?: FavoriteItem[]
  onToggleFavorite?: (item: Omit<FavoriteItem, 'addedAt'>) => void
  onClose: () => void
  onSetStatus: (statusId: string | null) => void
  onToggleLabel: (labelId: string, assigned: boolean) => void
  onDeleteSession?: (session: SessionInfo, options?: DeleteSessionRequestOptions) => void
  onResumeSession?: (session: SessionInfo) => void | Promise<void>
  onCopyResumeSession?: (session: SessionInfo) => void | Promise<void>
  onOpenPreviewRenameDialog?: (session: SessionInfo) => void
  terminal?: string
  piPath?: string
  customCommand?: string
  resumeCommand?: string
}

export default function KanbanSessionContextMenu({
  session,
  position,
  statuses,
  currentStatusId,
  labels,
  allLabels,
  favorites: providedFavorites,
  onToggleFavorite: providedToggleFavorite,
  onClose,
  onSetStatus,
  onToggleLabel,
  onDeleteSession,
  onResumeSession,
  onCopyResumeSession,
  onOpenPreviewRenameDialog,
  terminal,
  piPath,
  customCommand,
  resumeCommand,
}: KanbanSessionContextMenuProps) {
  const { copyText } = useClipboard()
  const useRuntimeFavoriteState =
    providedFavorites === undefined || providedToggleFavorite === undefined
  const runtimeFavorites = useFavorites({ enabled: useRuntimeFavoriteState })
  const favorites = useRuntimeFavoriteState
    ? runtimeFavorites.favorites
    : providedFavorites
  const toggleFavorite = useRuntimeFavoriteState
    ? runtimeFavorites.toggleFavorite
    : providedToggleFavorite

  return (
    <KanbanContextMenu
      session={session}
      statuses={statuses}
      currentStatusId={currentStatusId}
      labels={labels}
      allLabels={allLabels}
      favorites={favorites}
      position={position}
      onClose={onClose}
      onOpenInTerminal={async () => {
        if (onResumeSession) {
          await onResumeSession(session)
          return
        }
        if (!isTauri()) return
        try {
          await openSessionInTerminalDirect(session, {
            terminal,
            customCommand,
            piPath,
            resumeCommand,
          })
        } catch (error) {
          console.error('Failed to open in terminal:', error)
        }
      }}
      onOpenInBrowser={async () => {
        if (!isTauri()) return
        try {
          await invoke('open_session_in_browser', { path: session.path })
        } catch (error) {
          console.error('Failed to open in browser:', error)
        }
      }}
      onToggleFavorite={() => {
        void toggleFavorite({
          type: 'session',
          id: session.id,
          name: session.name || session.first_message || 'Untitled',
          path: session.path,
        })
      }}
      onResume={
        onResumeSession
          ? async () => {
              await onResumeSession(session)
            }
          : undefined
      }
      onSetStatus={onSetStatus}
      onToggleLabel={onToggleLabel}
      onCopyResume={
        onCopyResumeSession
          ? async () => {
              await onCopyResumeSession(session)
            }
          : isTauri()
            ? () => {
                void buildCopyResumeCommand(session, { piPath, resumeCommand }).then((command) =>
                  copyText(command).catch(console.error),
                )
              }
            : undefined
      }
      onRename={
        onOpenPreviewRenameDialog
          ? () => {
              onOpenPreviewRenameDialog(session)
            }
          : undefined
      }
      onDelete={(anchorPoint) => {
        onDeleteSession?.(session, { anchorPoint })
      }}
    />
  )
}
