import { useMemo } from 'react'
import type { LegacySessionStats, SessionEntry } from '../types'
import { computeStats } from '../utils/session'

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
): Set<string> | null {
  if (!activeEntryId || entryById.size === 0) return null

  const pathEntryIds = new Set<string>()
  let currentEntry = entryById.get(activeEntryId)

  while (currentEntry) {
    pathEntryIds.add(currentEntry.id)
    if (!currentEntry.parentId || currentEntry.parentId === currentEntry.id) {
      break
    }
    currentEntry = entryById.get(currentEntry.parentId)
  }

  return pathEntryIds
}

function isRenderableMessageEntry(
  entry: SessionEntry,
  pathEntryIds: Set<string> | null,
): boolean {
  if (entry.type !== 'message') return false
  if (pathEntryIds && !pathEntryIds.has(entry.id)) return false

  const role = entry.message?.role
  return role === 'user' || role === 'assistant'
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
  activeEntryId: string | null,
): SessionViewerDerivedData {
  return useMemo(() => {
    const entryById = new Map<string, SessionEntry>()
    for (const entry of entries) {
      entryById.set(entry.id, entry)
    }

    const pathEntryIds = resolvePathEntryIds(activeEntryId, entryById)
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

        if (!isRenderableMessageEntry(entry, pathEntryIds)) {
          continue
        }

        renderableEntries.push(entry)
        continue
      }

      if (isRenderableNonMessageEntry(entry)) {
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
  }, [entries, activeEntryId])
}
