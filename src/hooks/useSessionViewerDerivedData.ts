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
        // Look ahead to see if the next renderable non-message entry is also
        // a model_change — if so, skip this one.
        if (entry.type === 'model_change') {
          let isFollowedByModelChange = false
          for (let i = idx + 1; i < entries.length; i++) {
            const next = entries[i]
            if (!next) continue
            if (next.type === 'message') {
              // Renderable message roles break the consecutive run
              if (isRenderableMessageEntry(next)) break
              // Non-renderable message roles (toolResult, etc.) don't break it
              continue
            }
            if (next.type === 'model_change') {
              isFollowedByModelChange = true
              break
            }
            // Any other renderable non-message entry breaks the run
            break
          }
          if (isFollowedByModelChange) continue
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
