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

function resolvePathEntryIds(
  activeEntryId: string | null,
  entryById: ReadonlyMap<string, SessionEntry>,
  allEntries: SessionEntry[],
): Set<string> | null {
  if (!activeEntryId || entryById.size === 0) return null

  const pathEntryIds = new Set<string>()
  let currentEntry = entryById.get(activeEntryId)

  while (currentEntry) {
    pathEntryIds.add(currentEntry.id)
    const pid = currentEntry.parentId
    if (!pid || pid === currentEntry.id || pid === "None" || pid === "null" || pid === "NONE") break
    const parent = entryById.get(pid)
    if (parent) {
      currentEntry = parent
    } else {
      // Parent not found in entries (may have been filtered out).
      // Fallback: use the previous entry in the flat list as the path.
      const idx = allEntries.findIndex(e => e.id === currentEntry!.id)
      if (idx > 0) {
        currentEntry = allEntries[idx - 1]
      } else {
        break
      }
    }
  }

  return pathEntryIds
}

function isRenderableMessageEntry(
  entry: SessionEntry,
  pathEntryIds: Set<string> | null,
  isLive?: boolean,
): boolean {
  if (entry.type !== 'message') return false
  // Non-live mode: only show entries on the active path
  if (!isLive && pathEntryIds && !pathEntryIds.has(entry.id)) return false

  const role = entry.message?.role
  return role === 'user' || role === 'assistant' || role === 'developer' || role === 'system'
}

function isRenderableNonMessageEntry(
  entry: SessionEntry,
  pathEntryIds: Set<string> | null,
  isLive?: boolean,
): boolean {
  if (!isLive && pathEntryIds && !pathEntryIds.has(entry.id)) return false

  return (
    entry.type === 'model_change' ||
    entry.type === 'compaction' ||
    entry.type === 'branch_summary' ||
    entry.type === 'custom_message'
  )
}

export function useSessionViewerDerivedData(
  entries: SessionEntry[],
  activeEntryId: string | null,
  isLive?: boolean,
  previewMode = false,
): SessionViewerDerivedData {
  return useMemo(() => {
    const entryById = new Map<string, SessionEntry>()
    for (const entry of entries) {
      entryById.set(entry.id, entry)
    }

    const pathEntryIds = resolvePathEntryIds(activeEntryId, entryById, entries)
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

        // In preview mode, skip path filtering — DB already returns only
        // the messages we need, and DB entries have no parentId for path resolution.
        if (!isRenderableMessageEntry(entry, pathEntryIds, isLive || previewMode)) {
          continue
        }

        renderableEntries.push(entry)
        continue
      }

      if (!previewMode && isRenderableNonMessageEntry(entry, pathEntryIds, isLive)) {
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
  }, [entries, activeEntryId, isLive, previewMode])
}
