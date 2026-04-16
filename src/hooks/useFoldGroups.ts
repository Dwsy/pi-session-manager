import { useMemo } from 'react'
import type { SessionEntry } from '@/types'
import {
  hasVisibleText,
  isProcessOnlyEntry,
  isLoopEntry,
} from '@/components/messages/assistantProcess'

export interface FoldGroup {
  /** Entry ID of the fold group leader (the last entry in the group, which has text or is standalone) */
  leaderId: string
  /** All entries in the fold group (assistant messages with tools but no text) */
  entries: SessionEntry[]
}

export interface FoldGroupInfo {
  /** Map from leader entry ID to fold group data */
  groups: Map<string, FoldGroup>
  /** Entry IDs that should be hidden (0 height in virtual scroll) */
  hiddenEntryIds: Set<string>
}

/**
 * Group consecutive assistant entries without text blocks into fold groups.
 *
 * Logic:
 * - Scan renderableEntries for consecutive assistant entries
 * - If an assistant entry has tool calls but NO text blocks, it's a "fold entry"
 * - Consecutive fold entries are merged into one group
 * - The group leader is the last entry in the group (or the entry with text that follows)
 * - If a fold group is followed by an assistant with text, that text entry becomes the leader
 *
 * Example:
 *   [user] → [a1: th + t10] → [a2: t22] → [a3: text]
 *   Result: fold group { leader: a3.id, entries: [a1, a2] }
 *           a1, a2 are hidden (0 height), a3 renders the fold + text
 */
export function useFoldGroups(
  renderableEntries: SessionEntry[],
  enabled: boolean = true,
): FoldGroupInfo {
  return useMemo(() => {
    if (!enabled) {
      return { groups: new Map<string, FoldGroup>(), hiddenEntryIds: new Set<string>() }
    }
    const groups = new Map<string, FoldGroup>()
    const hiddenEntryIds = new Set<string>()

    let foldBuffer: SessionEntry[] = []

    for (let i = 0; i < renderableEntries.length; i++) {
      const entry = renderableEntries[i]
      const isAssistant = entry.type === 'message' && entry.message?.role === 'assistant'
      const isLoop = isLoopEntry(entry)

      if (isAssistant || isLoop) {
        if (isLoop || isProcessOnlyEntry(entry)) {
          foldBuffer.push(entry)
        } else {
          const visibleText = isAssistant && hasVisibleText(entry.message?.content || [])
          if (foldBuffer.length > 0 && visibleText) {
            groups.set(entry.id, {
              leaderId: entry.id,
              entries: [...foldBuffer],
            })
            for (const fe of foldBuffer) {
              hiddenEntryIds.add(fe.id)
            }
            foldBuffer = []
          } else if (foldBuffer.length > 0) {
            const leader = foldBuffer[foldBuffer.length - 1]
            // Leader is NOT in foldEntries, NOT hidden (it renders normally with its visible text)
            const memberEntries = foldBuffer.slice(0, -1)
            groups.set(leader.id, {
              leaderId: leader.id,
              entries: memberEntries,
            })
            for (const fe of memberEntries) {
              hiddenEntryIds.add(fe.id)
            }
            foldBuffer = []
          }
        }
      } else {
        // Non-assistant entry: flush fold buffer
        if (foldBuffer.length > 0) {
          const leader = foldBuffer[foldBuffer.length - 1]
          // Leader itself should NOT be in foldEntries (avoids duplicate content in buildAssistantProcessSteps)
          const memberEntries = foldBuffer.slice(0, -1)
          groups.set(leader.id, {
            leaderId: leader.id,
            entries: memberEntries,
          })
          for (const fe of memberEntries) {
            hiddenEntryIds.add(fe.id)
          }
          foldBuffer = []
        }
      }
    }

    // Flush remaining fold buffer
    if (foldBuffer.length > 0) {
      const leader = foldBuffer[foldBuffer.length - 1]
      // Leader itself should NOT be in foldEntries
      const memberEntries = foldBuffer.slice(0, -1)
      groups.set(leader.id, {
        leaderId: leader.id,
        entries: memberEntries,
      })
      for (const fe of memberEntries) {
        hiddenEntryIds.add(fe.id)
      }
    }

    return { groups, hiddenEntryIds }
  }, [renderableEntries, enabled])
}