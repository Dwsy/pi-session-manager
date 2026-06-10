import { useMemo } from 'react'
import type { LegacySessionStats, SessionEntry } from '@/types'
import { computeStats } from '@/utils/session'

export interface SessionViewerDerivedData {
  renderableEntries: SessionEntry[]
  toolResultByCallId: Map<string, SessionEntry>
  stats: LegacySessionStats
  headerEntry: SessionEntry | undefined
  messageEntries: SessionEntry[]
}

function isRenderableMessageEntry(entry: SessionEntry): boolean {
  if (entry.type !== 'message') return false

  const role = entry.message?.role
  return role === 'user' || role === 'assistant' || role === 'developer' || role === 'system'
}

function isRenderableNonMessageEntry(entry: SessionEntry): boolean {
  return (
    entry.type === 'model_change' ||
    entry.type === 'compaction' ||
    entry.type === 'branch_summary' ||
    entry.type === 'custom_message'
  )
}

export function useSessionViewerDerivedData(
  entries: SessionEntry[],
  _activeEntryId: string | null,
  _isLive?: boolean,
  previewMode = false,
): SessionViewerDerivedData {
  return useMemo(() => {
    const renderableEntries: SessionEntry[] = []
    const toolResultByCallId = new Map<string, SessionEntry>()
    const messageEntries: SessionEntry[] = []
    let headerEntry: SessionEntry | undefined

    for (const entry of entries) {
      if (!headerEntry && entry.type === 'session') {
        headerEntry = entry
      }

      if (entry.type === 'message') {
        messageEntries.push(entry)

        if (entry.message?.role === 'toolResult' && entry.message.toolCallId) {
          toolResultByCallId.set(entry.message.toolCallId, entry)
        }

        if (!isRenderableMessageEntry(entry)) {
          continue
        }

        renderableEntries.push(entry)
        continue
      }

      if (!previewMode && isRenderableNonMessageEntry(entry)) {
        renderableEntries.push(entry)
      }
    }

    return {
      renderableEntries,
      toolResultByCallId,
      stats: computeStats(entries),
      headerEntry,
      messageEntries,
    }
  }, [entries, previewMode])
}
