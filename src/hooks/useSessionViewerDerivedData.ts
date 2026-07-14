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

/** True when a later model_change follows without a renderable entry between. */
export function isFollowedByModelChange(
  entries: SessionEntry[],
  idx: number,
): boolean {
  for (let i = idx + 1; i < entries.length; i++) {
    const next = entries[i]
    if (!next) continue
    if (next.type === 'model_change') return true
    if (next.type === 'message') {
      if (isRenderableMessageEntry(next)) return false
      continue
    }
    if (isRenderableNonMessageEntry(next)) return false
  }
  return false
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

    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx]!

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
        // For model_change: only keep the last in a consecutive run.
        // Non-renderable entries (label, thinking_level_change, toolResult, etc.)
        // do not break the run — only a renderable message or another
        // renderable non-message type does.
        if (entry.type === 'model_change' && isFollowedByModelChange(entries, idx)) {
          continue
        }
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
